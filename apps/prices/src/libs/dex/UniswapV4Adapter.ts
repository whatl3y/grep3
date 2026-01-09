import { Contract, JsonRpcProvider } from "ethers";
import { DexConfig } from "../../config";
import log from "../../logger";
import { PoolData } from "./types";

/**
 * Uniswap V4 uses a singleton PoolManager architecture where all pools
 * are managed by a single contract. Pools are identified by a PoolKey
 * which includes the two tokens, fee, tickSpacing, and hooks address.
 *
 * The V4 Quoter provides price quotes through the StateView contract.
 */

// V4 Quoter ABI (for getting quotes)
const V4_QUOTER_ABI = [
  // quoteExactInputSingle
  "function quoteExactInputSingle(tuple(address poolManager, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) external returns (uint256 amountOut, uint256 gasEstimate)",
  // quoteExactOutputSingle
  "function quoteExactOutputSingle(tuple(address poolManager, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) external returns (uint256 amountIn, uint256 gasEstimate)",
];

// V4 PoolManager ABI (minimal for reading pool state)
const V4_POOL_MANAGER_ABI = [
  // Get pool liquidity
  "function getLiquidity(bytes32 poolId) external view returns (uint128)",
  // Get pool slot0 (sqrtPriceX96, tick, etc)
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
];

// Common fee tiers and tick spacings for V4
const V4_FEE_CONFIGS = [
  { fee: 100, tickSpacing: 1 },    // 0.01%
  { fee: 500, tickSpacing: 10 },   // 0.05%
  { fee: 3000, tickSpacing: 60 },  // 0.30%
  { fee: 10000, tickSpacing: 200 }, // 1.00%
];

// Zero address for hooks (most common pools have no hooks)
const ZERO_HOOKS = "0x0000000000000000000000000000000000000000";

class UniswapV4Adapter {
  /**
   * Find the best V4 pool for a token pair
   * V4 pools are identified by PoolKey, not by deployed contract addresses
   */
  async findBestPool(
    tokenAddress: string,
    quoteAssets: string[],
    dex: DexConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    if (!dex.poolManager || !dex.quoter) {
      log.debug(`V4 DEX ${dex.name} missing poolManager or quoter`);
      return null;
    }

    const poolManager = new Contract(dex.poolManager, V4_POOL_MANAGER_ABI, provider);

    let bestPool: PoolData | null = null;
    let bestLiquidity = BigInt(0);

    // For each quote asset, try to find pools with different fee tiers
    for (const quoteAsset of quoteAssets) {
      for (const feeConfig of V4_FEE_CONFIGS) {
        try {
          const pool = await this.getPoolData(
            tokenAddress,
            quoteAsset,
            feeConfig.fee,
            feeConfig.tickSpacing,
            dex,
            poolManager
          );

          if (pool && pool.liquidity > bestLiquidity) {
            bestLiquidity = pool.liquidity;
            bestPool = pool;
          }
        } catch (error) {
          log.debug(
            `V4 pool lookup failed for ${dex.name} fee ${feeConfig.fee}: ${error}`
          );
        }
      }
    }

    return bestPool;
  }

  private async getPoolData(
    tokenA: string,
    tokenB: string,
    fee: number,
    tickSpacing: number,
    dex: DexConfig,
    poolManager: Contract
  ): Promise<PoolData | null> {
    // Sort tokens to determine currency0 and currency1
    const [currency0, currency1] = this.sortTokens(tokenA, tokenB);

    // Compute the poolId from the PoolKey
    const poolId = this.computePoolId(currency0, currency1, fee, tickSpacing, ZERO_HOOKS);

    // Try to get pool slot0 to check if pool exists
    try {
      const [sqrtPriceX96, tick, , ] = await poolManager.getSlot0(poolId);

      // If sqrtPriceX96 is 0, pool doesn't exist or has no liquidity
      if (sqrtPriceX96 === BigInt(0)) {
        return null;
      }

      // Get liquidity
      const liquidity = await poolManager.getLiquidity(poolId);

      if (liquidity === BigInt(0)) {
        return null;
      }

      return {
        address: poolId, // V4 uses poolId instead of contract address
        token0: currency0.toLowerCase(),
        token1: currency1.toLowerCase(),
        liquidity,
        sqrtPriceX96,
        tick: Number(tick),
        dexName: dex.name,
        dexType: "uniswap_v4",
      };
    } catch {
      // Pool doesn't exist
      return null;
    }
  }

  /**
   * Sort tokens to determine currency0 and currency1
   * In V4, currency0 < currency1 numerically
   */
  private sortTokens(tokenA: string, tokenB: string): [string, string] {
    const a = tokenA.toLowerCase();
    const b = tokenB.toLowerCase();
    return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  }

  /**
   * Compute the poolId from a PoolKey
   * poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
   */
  private computePoolId(
    currency0: string,
    currency1: string,
    fee: number,
    tickSpacing: number,
    hooks: string
  ): string {
    const { keccak256, AbiCoder } = require("ethers");
    const abiCoder = new AbiCoder();

    const encoded = abiCoder.encode(
      ["address", "address", "uint24", "int24", "address"],
      [currency0, currency1, fee, tickSpacing, hooks]
    );

    return keccak256(encoded);
  }

  /**
   * Calculate price from V4 pool data
   * Same formula as V3 since V4 uses the same sqrtPriceX96 representation
   */
  calculatePrice(
    pool: PoolData,
    isToken0: boolean,
    tokenDecimals: number,
    quoteDecimals: number
  ): number {
    if (!pool.sqrtPriceX96) {
      return 0;
    }

    const sqrtPriceX96 = pool.sqrtPriceX96;
    const Q96 = BigInt(2) ** BigInt(96);

    // Calculate price from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96)^2
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    let price = sqrtPrice * sqrtPrice;

    // Adjust for decimals
    const decimalAdjustment = Math.pow(10, tokenDecimals - quoteDecimals);
    price = price * decimalAdjustment;

    // If our token is token0, we need to invert the price
    // because price represents token1/token0
    if (isToken0) {
      return price > 0 ? 1 / price : 0;
    }

    return price;
  }
}

export default new UniswapV4Adapter();
