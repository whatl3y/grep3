import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import { TickMath, SqrtPriceMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import config, { ChainConfig, chains, DEFAULT_CHAIN_ID } from "../config";
import log from "../logger";
import {
  PoolInfo,
  TokenInfo,
  TickData,
  LiquidityDistribution,
} from "../types";

// ABIs for Uniswap V3 contracts
const POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
  "function tickSpacing() external view returns (int24)",
  "function liquidity() external view returns (uint128)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
  "function tickBitmap(int16 wordPosition) external view returns (uint256)",
];

const ERC20_ABI = [
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function decimals() external view returns (uint8)",
];

// Tick lens for efficient tick queries
const TICK_LENS_ABI = [
  "function getPopulatedTicksInWord(address pool, int16 tickBitmapIndex) external view returns (tuple(int24 tick, int128 liquidityNet, uint128 liquidityGross)[] populatedTicks)",
];

// Max concurrent RPC requests to avoid rate limiting
const MAX_CONCURRENT_REQUESTS = 10;

// Progress callback type
export type ProgressCallback = (progress: {
  phase: string;
  percent: number;
  message: string;
  currentBatch?: number;
  totalBatches?: number;
}) => void;

// Helper to check if an error is a rate limit error
function isRateLimitError(error: any): boolean {
  const errorMsg = error.message || error.toString();
  const errorInfo = error.info?.error?.message || '';
  return (
    errorMsg.includes('rate limit') ||
    errorMsg.includes('too many requests') ||
    errorMsg.includes('over rate limit') ||
    errorInfo.includes('rate limit') ||
    errorInfo.includes('too many requests') ||
    errorInfo.includes('over rate limit') ||
    error.code === 429 ||
    error.info?.error?.code === -32016 // Common rate limit error code
  );
}

// Helper to create a user-friendly error message
function createRpcError(error: any, chainName: string): Error {
  if (isRateLimitError(error)) {
    return new Error(
      `RPC rate limit exceeded on ${chainName}. ` +
      `Public RPCs have strict limits. Please configure a dedicated RPC provider ` +
      `(Alchemy, Infura, QuickNode) in your .env file.`
    );
  }
  const errorMsg = error.message || error.toString();
  return new Error(`RPC error on ${chainName}: ${errorMsg}`);
}

export class UniswapV3 {
  private provider: ethers.JsonRpcProvider;
  private chainConfig: ChainConfig;
  private tickLensAddress: string;

  constructor(chainIdOrRpcUrl?: number | string) {
    // Determine chain config based on input
    if (typeof chainIdOrRpcUrl === "number") {
      // Chain ID provided
      this.chainConfig = chains[chainIdOrRpcUrl] || chains[DEFAULT_CHAIN_ID];
      this.provider = new ethers.JsonRpcProvider(this.chainConfig.rpcUrl);
    } else if (chainIdOrRpcUrl && chainIdOrRpcUrl.startsWith("http")) {
      // RPC URL provided (legacy behavior)
      this.chainConfig = chains[DEFAULT_CHAIN_ID];
      this.provider = new ethers.JsonRpcProvider(chainIdOrRpcUrl);
    } else {
      // Default to Ethereum mainnet
      this.chainConfig = chains[DEFAULT_CHAIN_ID];
      this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl);
    }

    this.tickLensAddress = this.chainConfig.uniswap.v3.tickLens;
    log.debug(`UniswapV3 initialized for chain ${this.chainConfig.displayName} (${this.chainConfig.chainId})`);
  }

  get chainId(): number {
    return this.chainConfig.chainId;
  }

  get chainName(): string {
    return this.chainConfig.name;
  }

  get chainDisplayName(): string {
    return this.chainConfig.displayName;
  }

  async getPoolInfo(poolAddress: string, onProgress?: ProgressCallback): Promise<PoolInfo> {
    onProgress?.({
      phase: "pool_info",
      percent: 5,
      message: `Fetching pool information from ${this.chainConfig.displayName}...`,
    });

    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);

    let token0Address, token1Address, fee, tickSpacing, liquidity, slot0;
    try {
      [token0Address, token1Address, fee, tickSpacing, liquidity, slot0] =
        await Promise.all([
          pool.token0(),
          pool.token1(),
          pool.fee(),
          pool.tickSpacing(),
          pool.liquidity(),
          pool.slot0(),
        ]);
    } catch (error: any) {
      throw createRpcError(error, this.chainConfig.displayName);
    }

    onProgress?.({
      phase: "token_info",
      percent: 10,
      message: "Fetching token information...",
    });

    const [token0, token1] = await Promise.all([
      this.getTokenInfo(token0Address),
      this.getTokenInfo(token1Address),
    ]);

    const sqrtPriceX96 = slot0[0];
    const tick = Number(slot0[1]);

    // Calculate current price from sqrtPriceX96
    const sqrtPrice = new BigNumber(sqrtPriceX96.toString()).dividedBy(
      new BigNumber(2).pow(96)
    );
    const price = sqrtPrice.pow(2);

    // Adjust for decimals
    const decimalAdjustment = new BigNumber(10).pow(
      token0.decimals - token1.decimals
    );
    const adjustedPrice = price.multipliedBy(decimalAdjustment);

    return {
      address: poolAddress,
      token0,
      token1,
      fee: Number(fee),
      tickSpacing: Number(tickSpacing),
      liquidity: liquidity.toString(),
      sqrtPriceX96: sqrtPriceX96.toString(),
      tick,
      currentPrice: adjustedPrice.toString(),
      currentPriceInverted: new BigNumber(1).dividedBy(adjustedPrice).toString(),
      version: "v3",
      chainId: this.chainConfig.chainId,
      chainName: this.chainConfig.name,
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

    try {
      const [symbol, name, decimals] = await Promise.all([
        token.symbol(),
        token.name(),
        token.decimals(),
      ]);

      return {
        address: tokenAddress,
        symbol,
        name,
        decimals: Number(decimals),
      };
    } catch (error) {
      // Handle WETH and other tokens that might have non-standard implementations
      log.warn(`Failed to get token info for ${tokenAddress}`, error);
      return {
        address: tokenAddress,
        symbol: "UNKNOWN",
        name: "Unknown Token",
        decimals: 18,
      };
    }
  }

  async getLiquidityDistribution(
    poolAddress: string,
    priceRangePercent: number = config.priceRangePercent,
    onProgress?: ProgressCallback
  ): Promise<LiquidityDistribution> {
    const startTime = Date.now();
    const poolInfo = await this.getPoolInfo(poolAddress, onProgress);
    log.info(`Pool info fetched in ${Date.now() - startTime}ms`);

    // Calculate tick range based on price range percentage
    const currentTick = poolInfo.tick;
    const tickSpacing = poolInfo.tickSpacing;

    // Each tick represents ~0.01% price change (1.0001^tick)
    // For 50% price range: ln(1.5) / ln(1.0001) ≈ 4055 ticks
    const ticksForRange = Math.ceil(
      Math.log(1 + priceRangePercent / 100) / Math.log(1.0001)
    );

    const minTick = Math.floor((currentTick - ticksForRange) / tickSpacing) * tickSpacing;
    const maxTick = Math.ceil((currentTick + ticksForRange) / tickSpacing) * tickSpacing;

    log.info(`Fetching ticks from ${minTick} to ${maxTick} (range: ${(maxTick - minTick) / tickSpacing} ticks) for pool ${poolAddress}`);

    onProgress?.({
      phase: "tick_setup",
      percent: 15,
      message: `Preparing to fetch tick data (range: ${minTick} to ${maxTick})...`,
    });

    // Fetch populated ticks using optimized method
    const tickFetchStart = Date.now();
    const ticks = await this.getPopulatedTicksOptimized(poolAddress, minTick, maxTick, tickSpacing, onProgress);
    log.info(`Fetched ${ticks.length} populated ticks in ${Date.now() - tickFetchStart}ms`);

    onProgress?.({
      phase: "processing",
      percent: 90,
      message: "Processing tick data...",
    });

    // Calculate liquidity at each tick
    const ticksWithLiquidity = this.calculateLiquidityAtTicks(
      ticks,
      poolInfo,
      currentTick
    );

    // Calculate price range
    const minPrice = this.tickToPrice(minTick, poolInfo.token0.decimals, poolInfo.token1.decimals);
    const maxPrice = this.tickToPrice(maxTick, poolInfo.token0.decimals, poolInfo.token1.decimals);

    // Calculate total liquidity USD (simplified - would need price oracle for accurate USD values)
    const totalLiquidityUSD = ticksWithLiquidity.reduce(
      (sum, t) => sum + t.liquidityUSD,
      0
    );

    log.info(`Total liquidity distribution fetch completed in ${Date.now() - startTime}ms`);

    onProgress?.({
      phase: "complete",
      percent: 100,
      message: "Complete!",
    });

    return {
      pool: poolInfo,
      ticks: ticksWithLiquidity,
      priceRange: {
        min: minPrice.toString(),
        max: maxPrice.toString(),
        current: poolInfo.currentPrice,
      },
      totalLiquidityUSD,
      timestamp: Date.now(),
    };
  }

  private async getPopulatedTicksOptimized(
    poolAddress: string,
    minTick: number,
    maxTick: number,
    tickSpacing: number,
    onProgress?: ProgressCallback
  ): Promise<{ tick: number; liquidityNet: bigint; liquidityGross: bigint }[]> {
    const tickLens = new ethers.Contract(
      this.tickLensAddress,
      TICK_LENS_ABI,
      this.provider
    );

    // Calculate bitmap word positions
    const minWordPos = Math.floor(minTick / tickSpacing / 256);
    const maxWordPos = Math.ceil(maxTick / tickSpacing / 256);
    const wordPositions: number[] = [];

    for (let wordPos = minWordPos; wordPos <= maxWordPos; wordPos++) {
      wordPositions.push(wordPos);
    }

    log.info(`Querying ${wordPositions.length} bitmap words in parallel batches`);

    // Fetch all words in parallel batches
    const populatedTicks: { tick: number; liquidityNet: bigint; liquidityGross: bigint }[] = [];
    const totalBatches = Math.ceil(wordPositions.length / MAX_CONCURRENT_REQUESTS);

    // Process in batches to avoid overwhelming the RPC
    for (let i = 0; i < wordPositions.length; i += MAX_CONCURRENT_REQUESTS) {
      const currentBatch = Math.floor(i / MAX_CONCURRENT_REQUESTS) + 1;
      const batch = wordPositions.slice(i, i + MAX_CONCURRENT_REQUESTS);

      // Calculate progress: 15% (setup) + 75% (tick fetching) based on batch progress
      const batchProgress = 15 + Math.round((currentBatch / totalBatches) * 75);
      onProgress?.({
        phase: "fetching_ticks",
        percent: batchProgress,
        message: `Fetching tick data (batch ${currentBatch}/${totalBatches})...`,
        currentBatch,
        totalBatches,
      });

      const batchResults = await Promise.all(
        batch.map(async (wordPos) => {
          try {
            const ticks = await tickLens.getPopulatedTicksInWord(poolAddress, wordPos);
            return ticks.map((t: { tick: bigint; liquidityNet: bigint; liquidityGross: bigint }) => ({
              tick: Number(t.tick),
              liquidityNet: BigInt(t.liquidityNet.toString()),
              liquidityGross: BigInt(t.liquidityGross.toString()),
            }));
          } catch (e) {
            // Word might be empty or error, return empty array
            return [];
          }
        })
      );

      // Flatten and filter results
      for (const result of batchResults) {
        for (const t of result) {
          if (t.tick >= minTick && t.tick <= maxTick) {
            populatedTicks.push(t);
          }
        }
      }
    }

    // If TickLens returned no results, fall back to sampling (fast approximation)
    if (populatedTicks.length === 0) {
      log.warn("TickLens returned no results, falling back to sampled tick queries");
      return this.getSampledTicks(poolAddress, minTick, maxTick, tickSpacing, onProgress);
    }

    return populatedTicks.sort((a, b) => a.tick - b.tick);
  }

  // Fallback: Sample ticks at intervals instead of querying every tick
  private async getSampledTicks(
    poolAddress: string,
    minTick: number,
    maxTick: number,
    tickSpacing: number,
    onProgress?: ProgressCallback
  ): Promise<{ tick: number; liquidityNet: bigint; liquidityGross: bigint }[]> {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    const populatedTicks: { tick: number; liquidityNet: bigint; liquidityGross: bigint }[] = [];

    // Sample at larger intervals - get ~50 data points max
    const totalTicks = (maxTick - minTick) / tickSpacing;
    const sampleInterval = Math.max(1, Math.floor(totalTicks / 50)) * tickSpacing;

    const ticksToQuery: number[] = [];
    for (let tick = minTick; tick <= maxTick; tick += sampleInterval) {
      ticksToQuery.push(tick);
    }

    log.info(`Sampling ${ticksToQuery.length} ticks (interval: ${sampleInterval})`);

    const totalBatches = Math.ceil(ticksToQuery.length / MAX_CONCURRENT_REQUESTS);

    // Query in parallel batches
    for (let i = 0; i < ticksToQuery.length; i += MAX_CONCURRENT_REQUESTS) {
      const currentBatch = Math.floor(i / MAX_CONCURRENT_REQUESTS) + 1;
      const batch = ticksToQuery.slice(i, i + MAX_CONCURRENT_REQUESTS);

      // Calculate progress: 15% (setup) + 75% (tick fetching) based on batch progress
      const batchProgress = 15 + Math.round((currentBatch / totalBatches) * 75);
      onProgress?.({
        phase: "fetching_ticks",
        percent: batchProgress,
        message: `Sampling tick data (batch ${currentBatch}/${totalBatches})...`,
        currentBatch,
        totalBatches,
      });

      const batchResults = await Promise.all(
        batch.map(async (tick) => {
          try {
            const tickData = await pool.ticks(tick);
            if (tickData.liquidityGross > 0n) {
              return {
                tick,
                liquidityNet: BigInt(tickData.liquidityNet.toString()),
                liquidityGross: BigInt(tickData.liquidityGross.toString()),
              };
            }
            return null;
          } catch (e) {
            return null;
          }
        })
      );

      for (const result of batchResults) {
        if (result) {
          populatedTicks.push(result);
        }
      }
    }

    return populatedTicks.sort((a, b) => a.tick - b.tick);
  }

  private calculateLiquidityAtTicks(
    ticks: { tick: number; liquidityNet: bigint; liquidityGross: bigint }[],
    poolInfo: PoolInfo,
    currentTick: number
  ): TickData[] {
    const result: TickData[] = [];
    const sortedTicks = [...ticks].sort((a, b) => a.tick - b.tick);

    // Get token decimals and tick spacing
    const token0Decimals = poolInfo.token0.decimals;
    const token1Decimals = poolInfo.token1.decimals;
    const tickSpacing = poolInfo.tickSpacing;

    // Detect stablecoins and ETH tokens for USD conversion
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'LUSD'];
    const ethTokens = ['WETH', 'ETH'];
    const token0IsStable = stablecoins.includes(poolInfo.token0.symbol.toUpperCase());
    const token1IsStable = stablecoins.includes(poolInfo.token1.symbol.toUpperCase());
    const token0IsEth = ethTokens.includes(poolInfo.token0.symbol.toUpperCase());
    const token1IsEth = ethTokens.includes(poolInfo.token1.symbol.toUpperCase());

    // CRITICAL: Calculate CUMULATIVE ACTIVE LIQUIDITY at each tick
    //
    // In Uniswap V3, the pool tracks "liquidity" which is the total active liquidity
    // at the current tick. When price moves and crosses a tick boundary:
    // - If moving UP (price increasing, tick increasing): ADD liquidityNet when crossing INTO a tick
    // - If moving DOWN (price decreasing, tick decreasing): SUBTRACT liquidityNet when crossing OUT of a tick
    //
    // liquidityNet at tick T represents: (liquidity added by positions with lowerTick=T) - (liquidity removed by positions with upperTick=T)
    //
    // The liquidity in the range [tick, tick+tickSpacing) is what's active when price is in that range.

    // Get the current pool liquidity (total active liquidity at current tick)
    const currentLiquidity = BigInt(poolInfo.liquidity);

    // Create a map from populated ticks to their liquidityNet values
    const liquidityNetAtTick = new Map<number, bigint>();
    for (const t of sortedTicks) {
      liquidityNetAtTick.set(t.tick, t.liquidityNet);
    }

    // Determine the tick range to generate data for
    // Use the range from the populated ticks, or fall back to a range around current tick
    let minTick: number;
    let maxTick: number;

    if (sortedTicks.length > 0) {
      minTick = sortedTicks[0].tick;
      maxTick = sortedTicks[sortedTicks.length - 1].tick;
    } else {
      // No populated ticks - generate a range around current tick
      const ticksForRange = Math.ceil(Math.log(1.5) / Math.log(1.0001)); // ~50% range
      minTick = Math.floor((currentTick - ticksForRange) / tickSpacing) * tickSpacing;
      maxTick = Math.ceil((currentTick + ticksForRange) / tickSpacing) * tickSpacing;
    }

    // Generate ALL ticks in the range, not just populated ones
    // This ensures continuous liquidity data
    const allTicks: number[] = [];
    for (let tick = minTick; tick <= maxTick; tick += tickSpacing) {
      allTicks.push(tick);
    }

    // Map to store cumulative liquidity at each tick
    const liquidityAtTick = new Map<number, bigint>();

    // Find the index of the current tick in all ticks
    let currentTickIdx = allTicks.findIndex(t => t > currentTick);
    if (currentTickIdx === -1) currentTickIdx = allTicks.length;

    // Walk DOWN from current tick to calculate liquidity below
    let runningLiquidity = currentLiquidity;

    for (let i = currentTickIdx - 1; i >= 0; i--) {
      const tick = allTicks[i];

      // Record the liquidity for this tick range BEFORE crossing
      liquidityAtTick.set(tick, runningLiquidity);

      // If this tick is populated, apply the liquidityNet change
      const netChange = liquidityNetAtTick.get(tick) ?? 0n;
      if (netChange !== 0n) {
        // Crossing DOWN: subtract liquidityNet
        runningLiquidity = runningLiquidity - netChange;
      }
    }

    // Walk UP from current tick to calculate liquidity above
    runningLiquidity = currentLiquidity;

    for (let i = currentTickIdx; i < allTicks.length; i++) {
      const tick = allTicks[i];

      // If this tick is populated, apply the liquidityNet change
      const netChange = liquidityNetAtTick.get(tick) ?? 0n;
      if (netChange !== 0n) {
        // Crossing UP: add liquidityNet
        runningLiquidity = runningLiquidity + netChange;
      }

      // Record the liquidity for this tick range AFTER crossing
      liquidityAtTick.set(tick, runningLiquidity);
    }

    // Now convert each tick's cumulative liquidity to USD value
    for (const tick of allTicks) {
      const price0 = this.tickToPrice(tick, token0Decimals, token1Decimals);
      const price1 = new BigNumber(1).dividedBy(price0);

      // Get the CUMULATIVE active liquidity at this tick
      const activeLiquidity = liquidityAtTick.get(tick) ?? 0n;

      // Get liquidityNet/liquidityGross if this is a populated tick
      const populatedTick = sortedTicks.find(t => t.tick === tick);
      const liquidityNet = populatedTick?.liquidityNet ?? 0n;
      const liquidityGross = populatedTick?.liquidityGross ?? 0n;

      // Skip ticks with no liquidity
      if (activeLiquidity <= 0n) {
        result.push({
          tick,
          tickIdx: tick,
          liquidityNet: liquidityNet.toString(),
          liquidityGross: liquidityGross.toString(),
          price0: price0.toString(),
          price1: price1.toString(),
          liquidityUSD: 0,
        });
        continue;
      }

      // Calculate token amounts for this liquidity in this tick range
      // using Uniswap V3 SDK's SqrtPriceMath
      const tickLower = tick;
      const tickUpper = tick + tickSpacing;

      const sqrtPriceX96Lower = TickMath.getSqrtRatioAtTick(tickLower);
      const sqrtPriceX96Upper = TickMath.getSqrtRatioAtTick(tickUpper);

      // Convert to JSBI for SDK compatibility
      const liquidityJSBI = JSBI.BigInt(activeLiquidity.toString());

      // Get token amounts using the SDK's exact math
      const amount0JSBI = SqrtPriceMath.getAmount0Delta(
        sqrtPriceX96Lower,
        sqrtPriceX96Upper,
        liquidityJSBI,
        false
      );

      const amount1JSBI = SqrtPriceMath.getAmount1Delta(
        sqrtPriceX96Lower,
        sqrtPriceX96Upper,
        liquidityJSBI,
        false
      );

      // Convert to human-readable amounts
      const amount0 = new BigNumber(amount0JSBI.toString())
        .dividedBy(Math.pow(10, token0Decimals));
      const amount1 = new BigNumber(amount1JSBI.toString())
        .dividedBy(Math.pow(10, token1Decimals));

      // Calculate USD value based on which token is the stablecoin or ETH
      // For ETH-quoted pools, the liquidityUSD will be in ETH terms initially
      // The client will need to multiply by ETH/USD price if needed
      let liquidityUSD: number;

      if (token1IsStable) {
        // token1 is USD stablecoin (e.g., WETH/USDC)
        // price0 = USDC per token0, so USD = amount0 * price0 + amount1
        liquidityUSD = amount0.multipliedBy(price0).plus(amount1).toNumber();
      } else if (token0IsStable) {
        // token0 is USD stablecoin (e.g., USDC/WETH)
        // price1 = USDC per token1, so USD = amount0 + amount1 * price1
        liquidityUSD = amount0.plus(amount1.multipliedBy(price1)).toNumber();
      } else if (token1IsEth && !token0IsEth) {
        // token1 is WETH (e.g., SPX/WETH)
        // price0 = WETH per SPX, so ETH value = amount0 * price0 + amount1
        // This gives us value in ETH terms - multiply by 2x for rough USD estimate
        // (actual USD conversion happens in LiquidityService with real ETH price)
        const ethValue = amount0.multipliedBy(price0).plus(amount1);
        // Use a placeholder multiplier - the real conversion happens when we have priceDisplay
        liquidityUSD = ethValue.toNumber();
      } else if (token0IsEth && !token1IsEth) {
        // token0 is WETH (e.g., WETH/SPX)
        // price1 = WETH per token1, so ETH value = amount0 + amount1 * price1
        const ethValue = amount0.plus(amount1.multipliedBy(price1));
        liquidityUSD = ethValue.toNumber();
      } else {
        // Neither is stablecoin or ETH - use price0 as best estimate
        liquidityUSD = amount0.multipliedBy(price0).plus(amount1).toNumber();
      }

      result.push({
        tick,
        tickIdx: tick,
        liquidityNet: liquidityNet.toString(),
        liquidityGross: liquidityGross.toString(),
        price0: price0.toString(),
        price1: price1.toString(),
        liquidityUSD: Math.max(0, liquidityUSD),
      });
    }

    return result;
  }

  private tickToPrice(
    tick: number,
    token0Decimals: number,
    token1Decimals: number
  ): BigNumber {
    // Price = 1.0001^tick
    // Use Math.pow for efficiency - BigNumber.pow is extremely slow for large exponents
    // For tick values like 195000, BigNumber.pow would hang
    const price = Math.pow(1.0001, tick);
    // Adjust for decimals
    const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
    return new BigNumber(price * decimalAdjustment);
  }

  async isValidPool(address: string): Promise<boolean> {
    try {
      const pool = new ethers.Contract(address, POOL_ABI, this.provider);
      await pool.token0();
      return true;
    } catch (error: any) {
      // If it's a rate limit or network error, throw it so we don't incorrectly say pool doesn't exist
      if (isRateLimitError(error)) {
        throw createRpcError(error, this.chainConfig.displayName);
      }

      const errorMsg = error.message || error.toString();
      if (
        error.code === 'NETWORK_ERROR' ||
        errorMsg.includes('failed to detect network') ||
        errorMsg.includes('could not coalesce error') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ETIMEDOUT')
      ) {
        throw new Error(`RPC connection failed for ${this.chainConfig.displayName}. Details: ${errorMsg}`);
      }
      return false;
    }
  }
}

export default UniswapV3;
