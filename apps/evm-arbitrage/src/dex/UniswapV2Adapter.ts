import { Contract, AbiCoder } from "ethers";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { PoolInfo } from "../types/dex";
import { DexType } from "../config";
import log from "../logger";

// ABIs
const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  "function allPairsLength() external view returns (uint256)",
  "function allPairs(uint256) external view returns (address pair)",
];

const PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

/**
 * Adapter for Uniswap V2 and compatible forks
 * Supports: Uniswap V2, SushiSwap, PancakeSwap V2, ShibaSwap, BabyDogeSwap
 */
export class UniswapV2Adapter extends BaseDexAdapter {
  readonly dexType: DexType = "uniswap_v2";

  get dexName(): string {
    return this.dexConfig.name;
  }

  private factoryContract: Contract;

  constructor(dexConfig: any, provider: any) {
    super(dexConfig, provider);
    this.factoryContract = this.createContract(
      this.dexConfig.factory,
      FACTORY_ABI
    );
  }

  async discoverPools(tokens: string[]): Promise<PoolInfo[]> {
    const pools: PoolInfo[] = [];

    // Get all pair combinations
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        try {
          const pairAddress = await this.factoryContract.getPair(
            tokens[i],
            tokens[j]
          );

          if (pairAddress && pairAddress !== "0x0000000000000000000000000000000000000000") {
            const poolState = await this.getPoolState(pairAddress);
            if (poolState) {
              pools.push(poolState);
            }
          }
        } catch (err) {
          log.debug(
            { tokenA: tokens[i], tokenB: tokens[j], err },
            "Failed to get pair"
          );
        }
      }
    }

    return pools;
  }

  async getPoolState(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const pairContract = this.createContract(poolAddress, PAIR_ABI);

      const [token0, token1, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
      ]);

      return {
        address: poolAddress,
        chainId: this.chainId,
        dexType: this.dexType,
        dexName: this.dexName,
        token0,
        token1,
        reserve0: reserves.reserve0,
        reserve1: reserves.reserve1,
        fee: 30, // 0.3% standard fee for V2
      };
    } catch (err) {
      log.debug({ poolAddress, err }, "Failed to get pool state");
      return null;
    }
  }

  /**
   * Calculate output amount using constant product formula
   * amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
   */
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint {
    if (amountIn === 0n) return 0n;

    const isToken0 = this.isToken0(pool, tokenIn);
    const reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;
    const reserveOut = isToken0 ? pool.reserve1 : pool.reserve0;

    if (reserveIn === 0n || reserveOut === 0n) return 0n;

    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;

    return numerator / denominator;
  }

  /**
   * Calculate input amount for desired output
   * amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
   */
  getAmountIn(pool: PoolInfo, amountOut: bigint, tokenOut: string): bigint {
    if (amountOut === 0n) return 0n;

    const isToken0Out = this.isToken0(pool, tokenOut);
    const reserveIn = isToken0Out ? pool.reserve1 : pool.reserve0;
    const reserveOut = isToken0Out ? pool.reserve0 : pool.reserve1;

    if (reserveIn === 0n || reserveOut === 0n || amountOut >= reserveOut) {
      return 0n;
    }

    const numerator = reserveIn * amountOut * 1000n;
    const denominator = (reserveOut - amountOut) * 997n;

    return numerator / denominator + 1n;
  }

  /**
   * Encode swap data for UniswapV2Swapper contract
   * Encodes: { router: address, path: address[] }
   */
  encodeSwapData(
    pool: PoolInfo,
    tokenIn: string,
    tokenOut: string
  ): string {
    const abiCoder = AbiCoder.defaultAbiCoder();

    // For direct swaps, path is empty (swapper will use tokenIn -> tokenOut)
    const path: string[] = [];

    return abiCoder.encode(
      ["tuple(address router, address[] path)"],
      [
        {
          router: this.dexConfig.router,
          path,
        },
      ]
    );
  }
}
