import { Contract, JsonRpcProvider } from "ethers";
import { DexType, DexConfig, SupportedChainId } from "../config";
import { PoolInfo, IDexAdapter, SwapQuote } from "../types/dex";

/**
 * Abstract base class for DEX adapters
 */
export abstract class BaseDexAdapter implements IDexAdapter {
  abstract readonly dexType: DexType;
  abstract readonly dexName: string;

  protected provider: JsonRpcProvider;

  constructor(
    public readonly dexConfig: DexConfig,
    provider: JsonRpcProvider
  ) {
    this.provider = provider;
  }

  get chainId(): SupportedChainId {
    return this.dexConfig.chainId;
  }

  /**
   * Discover pools containing the given tokens
   */
  abstract discoverPools(tokens: string[]): Promise<PoolInfo[]>;

  /**
   * Get current pool state (reserves, price, etc.)
   */
  abstract getPoolState(poolAddress: string): Promise<PoolInfo | null>;

  /**
   * Calculate output amount for given input (no slippage)
   */
  abstract getAmountOut(
    pool: PoolInfo,
    amountIn: bigint,
    tokenIn: string
  ): bigint;

  /**
   * Calculate input amount for desired output
   */
  abstract getAmountIn(
    pool: PoolInfo,
    amountOut: bigint,
    tokenOut: string
  ): bigint;

  /**
   * Encode DEX-specific swap data for the swapper contract
   */
  abstract encodeSwapData(
    pool: PoolInfo,
    tokenIn: string,
    tokenOut: string
  ): string;

  /**
   * Get a swap quote with price impact
   */
  getSwapQuote(
    pool: PoolInfo,
    amountIn: bigint,
    tokenIn: string
  ): SwapQuote {
    const amountOut = this.getAmountOut(pool, amountIn, tokenIn);

    // Calculate price impact in basis points
    const priceImpactBps = this.calculatePriceImpact(
      pool,
      amountIn,
      amountOut,
      tokenIn
    );

    return {
      amountIn,
      amountOut,
      priceImpactBps,
      pool,
    };
  }

  /**
   * Calculate price impact in basis points
   */
  protected calculatePriceImpact(
    pool: PoolInfo,
    amountIn: bigint,
    amountOut: bigint,
    tokenIn: string
  ): number {
    // Default implementation for constant product AMMs
    const isToken0 = tokenIn.toLowerCase() === pool.token0.toLowerCase();
    const reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;
    const reserveOut = isToken0 ? pool.reserve1 : pool.reserve0;

    if (reserveIn === 0n || reserveOut === 0n) return 10000; // 100% impact

    // Expected price without impact: reserveOut / reserveIn
    // Actual price: amountOut / amountIn
    // Impact = 1 - (actual / expected)
    const expectedOut = (amountIn * reserveOut) / reserveIn;
    if (expectedOut === 0n) return 10000;

    const impactBps = Number(
      ((expectedOut - amountOut) * 10000n) / expectedOut
    );
    return Math.max(0, impactBps);
  }

  /**
   * Helper to create a contract instance
   */
  protected createContract(address: string, abi: any): Contract {
    return new Contract(address, abi, this.provider);
  }

  /**
   * Check if a token is token0 in the pool
   */
  protected isToken0(pool: PoolInfo, token: string): boolean {
    return token.toLowerCase() === pool.token0.toLowerCase();
  }

  /**
   * Sort tokens to get consistent ordering (token0 < token1)
   */
  protected sortTokens(
    tokenA: string,
    tokenB: string
  ): [string, string] {
    const a = tokenA.toLowerCase();
    const b = tokenB.toLowerCase();
    return a < b ? [tokenA, tokenB] : [tokenB, tokenA];
  }
}
