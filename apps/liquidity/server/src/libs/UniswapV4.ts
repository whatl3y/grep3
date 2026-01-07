import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import { TickMath, SqrtPriceMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import config from "../config";
import log from "../logger";
import {
  PoolInfo,
  TokenInfo,
  TickData,
  LiquidityDistribution,
} from "../types";
import { ProgressCallback } from "./UniswapV3";

// Uniswap V4 uses a different architecture with PoolManager
// Pool keys are computed from (currency0, currency1, fee, tickSpacing, hooks)

const ERC20_ABI = [
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function decimals() external view returns (uint8)",
];

// State view contract for V4 (provides consolidated reads)
// Note: StateView stores poolManager internally - functions only need poolId
const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) external view returns (uint128)",
  "function getTickInfo(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128)",
  "function getTickBitmap(bytes32 poolId, int16 wordPos) external view returns (uint256)",
];

// PoolManager Initialize event ABI - emitted when a pool is created
// event Initialize(PoolId indexed id, Currency indexed currency0, Currency indexed currency1, uint24 fee, int24 tickSpacing, IHooks hooks, uint160 sqrtPriceX96, int24 tick)
const POOL_MANAGER_ABI = [
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
];

// Block number when V4 PoolManager was deployed on mainnet (Jan 2025)
const POOL_MANAGER_DEPLOY_BLOCK = 21688329;

// In-memory cache for pool key lookups (poolId -> PoolKey)
const poolKeyCache = new Map<string, PoolKey>();

// Known state view address (Ethereum mainnet)
const STATE_VIEW_ADDRESS = "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227";

// Max concurrent RPC requests
const MAX_CONCURRENT_REQUESTS = 10;

// Known V4 pool configurations for easy lookup
// Note: V4 pools on Ethereum mainnet are identified by their pool ID (bytes32 keccak256 hash)
// To find existing pools, query Initialize events on the PoolManager contract
// Empty by default - users should enter pool IDs directly which will be looked up via events
export const KNOWN_V4_POOLS: Record<string, {
  name: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}> = {
  // Add verified V4 pools here as they become available
  // Example format:
  // "ETH-USDC-3000": {
  //   name: "ETH/USDC 0.3%",
  //   currency0: "0x0000000000000000000000000000000000000000",
  //   currency1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  //   fee: 3000,
  //   tickSpacing: 60,
  //   hooks: "0x0000000000000000000000000000000000000000",
  // },
};

export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export class UniswapV4 {
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl?: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl || config.ethRpcUrl);
  }

  // V4 pools are identified by a poolId derived from the pool key
  computePoolId(poolKey: PoolKey): string {
    // Ensure currency0 < currency1 (sorted order)
    const [c0, c1] =
      poolKey.currency0.toLowerCase() < poolKey.currency1.toLowerCase()
        ? [poolKey.currency0, poolKey.currency1]
        : [poolKey.currency1, poolKey.currency0];

    // Pack the pool key and hash it
    // V4 PoolKey struct: Currency currency0, Currency currency1, uint24 fee, int24 tickSpacing, IHooks hooks
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [c0, c1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
    );

    return ethers.keccak256(encoded);
  }

  // Get pool key from a known pool name
  getKnownPoolKey(poolName: string): PoolKey | null {
    const pool = KNOWN_V4_POOLS[poolName];
    if (!pool) return null;
    return {
      currency0: pool.currency0,
      currency1: pool.currency1,
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
      hooks: pool.hooks,
    };
  }

  // List all known pools
  getKnownPools(): { id: string; name: string; poolId: string }[] {
    return Object.entries(KNOWN_V4_POOLS).map(([id, pool]) => ({
      id,
      name: pool.name,
      poolId: this.computePoolId({
        currency0: pool.currency0,
        currency1: pool.currency1,
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooks: pool.hooks,
      }),
    }));
  }

  async getPoolInfo(poolId: string, poolKey: PoolKey, onProgress?: ProgressCallback): Promise<PoolInfo> {
    const startTime = Date.now();

    onProgress?.({
      phase: "pool_info",
      percent: 5,
      message: "Fetching V4 pool information...",
    });

    try {
      const stateView = new ethers.Contract(
        STATE_VIEW_ADDRESS,
        STATE_VIEW_ABI,
        this.provider
      );

      const [slot0, liquidity, token0, token1] = await Promise.all([
        stateView.getSlot0(poolId),
        stateView.getLiquidity(poolId),
        this.getTokenInfo(poolKey.currency0),
        this.getTokenInfo(poolKey.currency1),
      ]);

      onProgress?.({
        phase: "token_info",
        percent: 10,
        message: "Fetching token information...",
      });

      const sqrtPriceX96 = slot0[0];
      const tick = Number(slot0[1]);

      // Check if pool exists (sqrtPriceX96 should be non-zero)
      if (sqrtPriceX96.toString() === "0") {
        throw new Error("V4 pool not found or not initialized");
      }

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

      log.info(`V4 pool info fetched in ${Date.now() - startTime}ms`);

      return {
        address: poolId, // V4 uses poolId instead of address
        token0,
        token1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        liquidity: liquidity.toString(),
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick,
        currentPrice: adjustedPrice.toString(),
        currentPriceInverted: new BigNumber(1).dividedBy(adjustedPrice).toString(),
        version: "v4",
      };
    } catch (error: any) {
      log.error("Error getting V4 pool info:", error);
      throw new Error(`Failed to get V4 pool info: ${error.message}`);
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    // Handle native ETH (represented as address(0) in V4)
    if (tokenAddress === ethers.ZeroAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      return {
        address: tokenAddress,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
      };
    }

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
    poolKey: PoolKey,
    priceRangePercent: number = config.priceRangePercent,
    onProgress?: ProgressCallback
  ): Promise<LiquidityDistribution> {
    const startTime = Date.now();
    const poolId = this.computePoolId(poolKey);

    log.info(`Fetching V4 liquidity for poolId: ${poolId}`);

    const poolInfo = await this.getPoolInfo(poolId, poolKey, onProgress);
    const currentTick = poolInfo.tick;

    // Calculate tick range
    const ticksForRange = Math.ceil(
      Math.log(1 + priceRangePercent / 100) / Math.log(1.0001)
    );

    const minTick = Math.floor((currentTick - ticksForRange) / poolKey.tickSpacing) * poolKey.tickSpacing;
    const maxTick = Math.ceil((currentTick + ticksForRange) / poolKey.tickSpacing) * poolKey.tickSpacing;

    log.info(`Fetching V4 ticks from ${minTick} to ${maxTick} (range: ${(maxTick - minTick) / poolKey.tickSpacing} ticks)`);

    onProgress?.({
      phase: "tick_setup",
      percent: 15,
      message: `Preparing to fetch tick data (range: ${minTick} to ${maxTick})...`,
    });

    // Fetch populated ticks using optimized method
    const tickFetchStart = Date.now();
    const ticks = await this.getPopulatedTicksOptimized(poolId, minTick, maxTick, poolKey.tickSpacing, onProgress);
    log.info(`Fetched ${ticks.length} V4 populated ticks in ${Date.now() - tickFetchStart}ms`);

    onProgress?.({
      phase: "processing",
      percent: 90,
      message: "Processing tick data...",
    });

    // Calculate liquidity at each tick
    const ticksWithLiquidity = this.calculateLiquidityAtTicks(ticks, poolInfo);

    // Calculate price range
    const minPrice = this.tickToPrice(minTick, poolInfo.token0.decimals, poolInfo.token1.decimals);
    const maxPrice = this.tickToPrice(maxTick, poolInfo.token0.decimals, poolInfo.token1.decimals);

    const totalLiquidityUSD = ticksWithLiquidity.reduce(
      (sum, t) => sum + t.liquidityUSD,
      0
    );

    log.info(`V4 liquidity distribution fetch completed in ${Date.now() - startTime}ms`);

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
    poolId: string,
    minTick: number,
    maxTick: number,
    tickSpacing: number,
    onProgress?: ProgressCallback
  ): Promise<{ tick: number; liquidityNet: bigint; liquidityGross: bigint }[]> {
    const stateView = new ethers.Contract(
      STATE_VIEW_ADDRESS,
      STATE_VIEW_ABI,
      this.provider
    );

    // Calculate bitmap word positions
    const minWordPos = Math.floor(minTick / tickSpacing / 256);
    const maxWordPos = Math.ceil(maxTick / tickSpacing / 256);
    const wordPositions: number[] = [];

    for (let wordPos = minWordPos; wordPos <= maxWordPos; wordPos++) {
      wordPositions.push(wordPos);
    }

    log.info(`Querying ${wordPositions.length} V4 bitmap words in parallel batches`);

    const populatedTicks: { tick: number; liquidityNet: bigint; liquidityGross: bigint }[] = [];
    const totalBitmapBatches = Math.ceil(wordPositions.length / MAX_CONCURRENT_REQUESTS);

    // First, get all bitmaps in parallel to find which ticks are populated
    const ticksToQuery: number[] = [];

    for (let i = 0; i < wordPositions.length; i += MAX_CONCURRENT_REQUESTS) {
      const currentBatch = Math.floor(i / MAX_CONCURRENT_REQUESTS) + 1;
      const batch = wordPositions.slice(i, i + MAX_CONCURRENT_REQUESTS);

      // Progress for bitmap scanning: 15% - 40%
      const bitmapProgress = 15 + Math.round((currentBatch / totalBitmapBatches) * 25);
      onProgress?.({
        phase: "scanning_bitmaps",
        percent: bitmapProgress,
        message: `Scanning tick bitmaps (batch ${currentBatch}/${totalBitmapBatches})...`,
        currentBatch,
        totalBatches: totalBitmapBatches,
      });

      const bitmapResults = await Promise.all(
        batch.map(async (wordPos) => {
          try {
            const bitmap = await stateView.getTickBitmap(
              poolId,
              wordPos
            );
            return { wordPos, bitmap: BigInt(bitmap.toString()) };
          } catch (e) {
            return { wordPos, bitmap: 0n };
          }
        })
      );

      // Find set bits in each bitmap
      for (const { wordPos, bitmap } of bitmapResults) {
        if (bitmap === 0n) continue;

        for (let bitPos = 0; bitPos < 256; bitPos++) {
          if ((bitmap >> BigInt(bitPos)) & 1n) {
            const tick = (wordPos * 256 + bitPos) * tickSpacing;
            if (tick >= minTick && tick <= maxTick) {
              ticksToQuery.push(tick);
            }
          }
        }
      }
    }

    log.info(`Found ${ticksToQuery.length} populated ticks to query`);

    const totalTickBatches = Math.ceil(ticksToQuery.length / MAX_CONCURRENT_REQUESTS);

    // Now fetch tick info for all populated ticks in parallel
    for (let i = 0; i < ticksToQuery.length; i += MAX_CONCURRENT_REQUESTS) {
      const currentBatch = Math.floor(i / MAX_CONCURRENT_REQUESTS) + 1;
      const batch = ticksToQuery.slice(i, i + MAX_CONCURRENT_REQUESTS);

      // Progress for tick fetching: 40% - 90%
      const tickProgress = 40 + Math.round((currentBatch / totalTickBatches) * 50);
      onProgress?.({
        phase: "fetching_ticks",
        percent: tickProgress,
        message: `Fetching tick data (batch ${currentBatch}/${totalTickBatches})...`,
        currentBatch,
        totalBatches: totalTickBatches,
      });

      const tickResults = await Promise.all(
        batch.map(async (tick) => {
          try {
            const tickInfo = await stateView.getTickInfo(
              poolId,
              tick
            );
            return {
              tick,
              liquidityGross: BigInt(tickInfo.liquidityGross.toString()),
              liquidityNet: BigInt(tickInfo.liquidityNet.toString()),
            };
          } catch (e) {
            return null;
          }
        })
      );

      for (const result of tickResults) {
        if (result && result.liquidityGross > 0n) {
          populatedTicks.push(result);
        }
      }
    }

    return populatedTicks.sort((a, b) => a.tick - b.tick);
  }

  private calculateLiquidityAtTicks(
    ticks: { tick: number; liquidityNet: bigint; liquidityGross: bigint }[],
    poolInfo: PoolInfo
  ): TickData[] {
    const result: TickData[] = [];
    const sortedTicks = [...ticks].sort((a, b) => a.tick - b.tick);

    // Get token decimals and tick spacing
    const token0Decimals = poolInfo.token0.decimals;
    const token1Decimals = poolInfo.token1.decimals;
    const tickSpacing = poolInfo.tickSpacing;
    const currentTick = poolInfo.tick;

    // Detect stablecoins for USD conversion
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'LUSD'];
    const token0IsStable = stablecoins.includes(poolInfo.token0.symbol.toUpperCase());
    const token1IsStable = stablecoins.includes(poolInfo.token1.symbol.toUpperCase());

    // CRITICAL: Calculate CUMULATIVE ACTIVE LIQUIDITY at each tick
    // Same logic as V3 - start from current liquidity and walk through ticks
    const currentLiquidity = BigInt(poolInfo.liquidity);

    // Map to store cumulative liquidity at each tick
    const liquidityAtTick = new Map<number, bigint>();

    // Find the index of the current tick in sorted ticks (or where it would be)
    let currentTickIndex = sortedTicks.findIndex(t => t.tick > currentTick);
    if (currentTickIndex === -1) currentTickIndex = sortedTicks.length;

    // Process ticks at and below current price - walk from current going down
    let runningLiquidity = currentLiquidity;

    for (let i = currentTickIndex - 1; i >= 0; i--) {
      const tick = sortedTicks[i];
      // Record liquidity for this tick range before crossing
      liquidityAtTick.set(tick.tick, runningLiquidity);
      // Subtract liquidityNet as we cross this tick going down
      runningLiquidity = runningLiquidity - tick.liquidityNet;
    }

    // Process ticks above current price - walk from current going up
    runningLiquidity = currentLiquidity;

    for (let i = currentTickIndex; i < sortedTicks.length; i++) {
      const tick = sortedTicks[i];
      // Add liquidityNet as we cross this tick going up
      runningLiquidity = runningLiquidity + tick.liquidityNet;
      // Record liquidity for this tick range
      liquidityAtTick.set(tick.tick, runningLiquidity);
    }

    // Now convert each tick's cumulative liquidity to USD value
    for (const t of sortedTicks) {
      const price0 = this.tickToPrice(t.tick, token0Decimals, token1Decimals);
      const price1 = new BigNumber(1).dividedBy(price0);

      // Get the CUMULATIVE active liquidity at this tick
      const activeLiquidity = liquidityAtTick.get(t.tick) ?? 0n;

      // Skip ticks with no liquidity
      if (activeLiquidity <= 0n) {
        result.push({
          tick: t.tick,
          tickIdx: t.tick,
          liquidityNet: t.liquidityNet.toString(),
          liquidityGross: t.liquidityGross.toString(),
          price0: price0.toString(),
          price1: price1.toString(),
          liquidityUSD: 0,
        });
        continue;
      }

      // Calculate token amounts using Uniswap SDK (V4 uses same math as V3)
      const tickLower = t.tick;
      const tickUpper = t.tick + tickSpacing;

      const sqrtPriceX96Lower = TickMath.getSqrtRatioAtTick(tickLower);
      const sqrtPriceX96Upper = TickMath.getSqrtRatioAtTick(tickUpper);

      const liquidityJSBI = JSBI.BigInt(activeLiquidity.toString());

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

      const amount0 = new BigNumber(amount0JSBI.toString())
        .dividedBy(Math.pow(10, token0Decimals));
      const amount1 = new BigNumber(amount1JSBI.toString())
        .dividedBy(Math.pow(10, token1Decimals));

      let liquidityUSD: number;

      if (token1IsStable) {
        liquidityUSD = amount0.multipliedBy(price0).plus(amount1).toNumber();
      } else if (token0IsStable) {
        liquidityUSD = amount0.plus(amount1.multipliedBy(price1)).toNumber();
      } else {
        liquidityUSD = amount0.multipliedBy(price0).plus(amount1).toNumber();
      }

      result.push({
        tick: t.tick,
        tickIdx: t.tick,
        liquidityNet: t.liquidityNet.toString(),
        liquidityGross: t.liquidityGross.toString(),
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
    // Use Math.pow for efficiency - BigNumber.pow is extremely slow for large exponents
    // For tick values like 195000, BigNumber.pow would hang
    const price = Math.pow(1.0001, tick);
    const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
    return new BigNumber(price * decimalAdjustment);
  }

  async isValidPool(poolId: string): Promise<boolean> {
    try {
      const stateView = new ethers.Contract(
        STATE_VIEW_ADDRESS,
        STATE_VIEW_ABI,
        this.provider
      );
      const slot0 = await stateView.getSlot0(poolId);
      return slot0[0].toString() !== "0"; // sqrtPriceX96 should be non-zero for valid pool
    } catch {
      return false;
    }
  }

  /**
   * Get pool info directly from a pool ID (without needing the pool key).
   * This fetches on-chain data but won't have token symbols/names without additional lookups.
   * For full token info, the pool key with currency addresses is still needed.
   */
  async getPoolInfoFromId(poolId: string, onProgress?: ProgressCallback): Promise<{
    sqrtPriceX96: string;
    tick: number;
    protocolFee: number;
    lpFee: number;
    liquidity: string;
  } | null> {
    onProgress?.({
      phase: "pool_info",
      percent: 5,
      message: "Fetching V4 pool information from ID...",
    });

    try {
      const stateView = new ethers.Contract(
        STATE_VIEW_ADDRESS,
        STATE_VIEW_ABI,
        this.provider
      );

      const [slot0, liquidity] = await Promise.all([
        stateView.getSlot0(poolId),
        stateView.getLiquidity(poolId),
      ]);

      const sqrtPriceX96 = slot0[0];

      // Check if pool exists (sqrtPriceX96 should be non-zero)
      if (sqrtPriceX96.toString() === "0") {
        return null;
      }

      return {
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick: Number(slot0[1]),
        protocolFee: Number(slot0[2]),
        lpFee: Number(slot0[3]),
        liquidity: liquidity.toString(),
      };
    } catch (error: any) {
      log.error("Error getting V4 pool info from ID:", error);
      return null;
    }
  }

  /**
   * Check if a string is a valid bytes32 pool ID format (0x + 64 hex chars)
   */
  static isPoolIdFormat(value: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(value);
  }

  /**
   * Look up pool key from a pool ID by querying the Initialize event logs.
   * This allows users to provide just the pool ID without knowing the pool key.
   * Results are cached in memory for performance.
   */
  async getPoolKeyFromId(poolId: string, onProgress?: ProgressCallback): Promise<PoolKey | null> {
    const normalizedId = poolId.toLowerCase();

    // Check memory cache first
    if (poolKeyCache.has(normalizedId)) {
      log.info(`Pool key cache hit for ${poolId}`);
      return poolKeyCache.get(normalizedId)!;
    }

    // Check known pools
    for (const [, pool] of Object.entries(KNOWN_V4_POOLS)) {
      const key: PoolKey = {
        currency0: pool.currency0,
        currency1: pool.currency1,
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooks: pool.hooks,
      };
      if (this.computePoolId(key).toLowerCase() === normalizedId) {
        poolKeyCache.set(normalizedId, key);
        return key;
      }
    }

    onProgress?.({
      phase: "looking_up_pool",
      percent: 2,
      message: "Looking up pool key from on-chain events...",
    });

    log.info(`Looking up pool key for ${poolId} from Initialize events`);

    try {
      const poolManager = new ethers.Contract(
        config.uniswap.v4.poolManager,
        POOL_MANAGER_ABI,
        this.provider
      );

      // Query Initialize events filtered by pool ID
      // The pool ID is the first indexed parameter
      const filter = poolManager.filters.Initialize(poolId);

      // Get current block for the query range
      const currentBlock = await this.provider.getBlockNumber();

      // Query in chunks to avoid RPC limits (10k blocks at a time)
      const CHUNK_SIZE = 10000;
      let events: ethers.Log[] = [];

      for (let fromBlock = POOL_MANAGER_DEPLOY_BLOCK; fromBlock < currentBlock; fromBlock += CHUNK_SIZE) {
        const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, currentBlock);

        onProgress?.({
          phase: "scanning_events",
          percent: 2 + Math.round(((fromBlock - POOL_MANAGER_DEPLOY_BLOCK) / (currentBlock - POOL_MANAGER_DEPLOY_BLOCK)) * 8),
          message: `Scanning blocks ${fromBlock} to ${toBlock}...`,
        });

        const chunkEvents = await poolManager.queryFilter(filter, fromBlock, toBlock);
        if (chunkEvents.length > 0) {
          events = chunkEvents;
          break; // Found the event, no need to continue
        }
      }

      if (events.length === 0) {
        log.warn(`No Initialize event found for pool ID ${poolId}`);
        return null;
      }

      // Parse the event to get pool key components
      const event = events[0];
      const parsedLog = poolManager.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });

      if (!parsedLog) {
        log.error(`Failed to parse Initialize event for ${poolId}`);
        return null;
      }

      // Extract pool key from event
      // Event: Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, ...)
      const poolKey: PoolKey = {
        currency0: parsedLog.args[1], // indexed currency0
        currency1: parsedLog.args[2], // indexed currency1
        fee: Number(parsedLog.args[3]),
        tickSpacing: Number(parsedLog.args[4]),
        hooks: parsedLog.args[5],
      };

      log.info(`Found pool key for ${poolId}: currency0=${poolKey.currency0}, currency1=${poolKey.currency1}, fee=${poolKey.fee}, tickSpacing=${poolKey.tickSpacing}`);

      // Verify the pool key computes to the same pool ID
      const computedId = this.computePoolId(poolKey);
      if (computedId.toLowerCase() !== normalizedId) {
        log.error(`Pool key verification failed: computed ${computedId} but expected ${poolId}`);
        return null;
      }

      // Cache for future lookups
      poolKeyCache.set(normalizedId, poolKey);

      return poolKey;
    } catch (error: any) {
      log.error(`Error looking up pool key for ${poolId}:`, error);
      return null;
    }
  }

  /**
   * Get full liquidity distribution using only the pool ID.
   * Looks up the pool key from on-chain events if not cached.
   */
  async getLiquidityDistributionById(
    poolId: string,
    priceRangePercent: number = config.priceRangePercent,
    onProgress?: ProgressCallback
  ): Promise<LiquidityDistribution> {
    // Look up pool key from pool ID
    const poolKey = await this.getPoolKeyFromId(poolId, onProgress);

    if (!poolKey) {
      throw new Error(`Could not find pool key for pool ID ${poolId}. The pool may not exist or has not been initialized.`);
    }

    // Now fetch liquidity with the resolved pool key
    return this.getLiquidityDistribution(poolKey, priceRangePercent, onProgress);
  }
}

export default UniswapV4;
