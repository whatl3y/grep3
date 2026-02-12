import Logger from "bunyan";
import { Contract, JsonRpcProvider } from "ethers";
import { SupportedChainId } from "../config";
import { IDexAdapter, PoolInfo } from "../types/dex";
import { ReserveCache } from "../cache/ReserveCache";

// Multicall3 ABI
const MULTICALL_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[])",
];

// Multicall3 deployed address (same on all chains)
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

interface ReserveUpdaterOptions {
  log: Logger;
  provider: JsonRpcProvider;
  reserveCache: ReserveCache;
  batchSize?: number;
}

interface ReserveUpdate {
  pool: PoolInfo;
  reserve0: bigint;
  reserve1: bigint;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  tick?: number;
}

/**
 * Updates pool reserves using multicall for efficiency
 */
export class ReserveUpdater {
  private log: Logger;
  private provider: JsonRpcProvider;
  private reserveCache: ReserveCache;
  private multicall: Contract;
  private batchSize: number;

  constructor(options: ReserveUpdaterOptions) {
    this.log = options.log.child({ component: "ReserveUpdater" });
    this.provider = options.provider;
    this.reserveCache = options.reserveCache;
    this.multicall = new Contract(
      MULTICALL3_ADDRESS,
      MULTICALL_ABI,
      this.provider
    );
    this.batchSize = options.batchSize || 100;
  }

  /**
   * Update reserves for multiple pools using multicall
   */
  async updateReserves(
    chainId: SupportedChainId,
    pools: PoolInfo[],
    adapters: Map<string, IDexAdapter>
  ): Promise<ReserveUpdate[]> {
    if (pools.length === 0) return [];

    const updates: ReserveUpdate[] = [];
    const startTime = Date.now();

    // Process in batches to avoid gas limits
    for (let i = 0; i < pools.length; i += this.batchSize) {
      const batch = pools.slice(i, i + this.batchSize);
      const batchUpdates = await this.updateBatch(chainId, batch, adapters);
      updates.push(...batchUpdates);
    }

    const elapsed = Date.now() - startTime;
    this.log.debug(
      {
        chainId,
        poolCount: pools.length,
        updateCount: updates.length,
        elapsedMs: elapsed,
      },
      "Reserve update completed"
    );

    return updates;
  }

  /**
   * Update a batch of pools using multicall
   */
  private async updateBatch(
    chainId: SupportedChainId,
    pools: PoolInfo[],
    adapters: Map<string, IDexAdapter>
  ): Promise<ReserveUpdate[]> {
    const updates: ReserveUpdate[] = [];

    // Build multicall for V2-style pools (getReserves)
    const v2Pools = pools.filter(
      (p) => p.dexType === "uniswap_v2" || p.dexType === "solidly"
    );
    const v3Pools = pools.filter(
      (p) =>
        p.dexType === "uniswap_v3" ||
        p.dexType === "uniswap_v4" ||
        p.dexType === "algebra"
    );

    // Update V2 pools
    if (v2Pools.length > 0) {
      const v2Updates = await this.updateV2Pools(chainId, v2Pools);
      updates.push(...v2Updates);
    }

    // Update V3 pools
    if (v3Pools.length > 0) {
      const v3Updates = await this.updateV3Pools(chainId, v3Pools);
      updates.push(...v3Updates);
    }

    // Update other pools individually using adapters
    const otherPools = pools.filter(
      (p) =>
        p.dexType !== "uniswap_v2" &&
        p.dexType !== "solidly" &&
        p.dexType !== "uniswap_v3" &&
        p.dexType !== "uniswap_v4" &&
        p.dexType !== "algebra"
    );

    for (const pool of otherPools) {
      const adapter = adapters.get(pool.dexName);
      if (adapter) {
        try {
          const state = await adapter.getPoolState(pool.address);
          if (state) {
            updates.push({
              pool,
              reserve0: state.reserve0,
              reserve1: state.reserve1,
              sqrtPriceX96: state.sqrtPriceX96,
              liquidity: state.liquidity,
              tick: state.tick,
            });

            // Cache the update
            await this.reserveCache.setReserves(chainId, pool.address, {
              reserve0: state.reserve0,
              reserve1: state.reserve1,
              sqrtPriceX96: state.sqrtPriceX96,
              liquidity: state.liquidity,
              tick: state.tick,
            });
          }
        } catch (err) {
          this.log.debug(
            { pool: pool.address, err },
            "Failed to update pool reserves"
          );
        }
      }
    }

    return updates;
  }

  /**
   * Update V2-style pools using multicall
   */
  private async updateV2Pools(
    chainId: SupportedChainId,
    pools: PoolInfo[]
  ): Promise<ReserveUpdate[]> {
    const updates: ReserveUpdate[] = [];

    // Encode getReserves calls
    const getReservesSelector = "0x0902f1ac"; // getReserves()
    const calls = pools.map((pool) => ({
      target: pool.address,
      allowFailure: true,
      callData: getReservesSelector,
    }));

    try {
      // Use staticCall to ensure this is a read-only call (aggregate3 is payable)
      const results = await this.multicall.aggregate3.staticCall(calls);

      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const result = results[i];

        if (result.success && result.returnData.length >= 64) {
          try {
            // Decode reserves (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
            const data = result.returnData;
            const reserve0 = BigInt("0x" + data.slice(2, 66));
            const reserve1 = BigInt("0x" + data.slice(66, 130));

            updates.push({ pool, reserve0, reserve1 });

            // Update pool in place
            pool.reserve0 = reserve0;
            pool.reserve1 = reserve1;

            // Cache the update
            await this.reserveCache.setReserves(chainId, pool.address, {
              reserve0,
              reserve1,
            });
          } catch {
            // Decoding failed
          }
        }
      }
    } catch (err) {
      this.log.error({ chainId, err }, "Multicall failed for V2 pools");

      // Fall back to individual calls
      for (const pool of pools) {
        try {
          const pairContract = new Contract(
            pool.address,
            [
              "function getReserves() external view returns (uint112, uint112, uint32)",
            ],
            this.provider
          );
          const [reserve0, reserve1] = await pairContract.getReserves();
          updates.push({ pool, reserve0, reserve1 });
          pool.reserve0 = reserve0;
          pool.reserve1 = reserve1;
        } catch {
          // Skip failed pools
        }
      }
    }

    return updates;
  }

  /**
   * Update V3-style pools using multicall
   */
  private async updateV3Pools(
    chainId: SupportedChainId,
    pools: PoolInfo[]
  ): Promise<ReserveUpdate[]> {
    const updates: ReserveUpdate[] = [];

    // For V3 pools, we need slot0 and liquidity
    // slot0(): (uint160 sqrtPriceX96, int24 tick, ...)
    // liquidity(): uint128
    const slot0Selector = "0x3850c7bd"; // slot0()
    const liquiditySelector = "0x1a686502"; // liquidity()

    const calls: any[] = [];
    for (const pool of pools) {
      calls.push({
        target: pool.address,
        allowFailure: true,
        callData: slot0Selector,
      });
      calls.push({
        target: pool.address,
        allowFailure: true,
        callData: liquiditySelector,
      });
    }

    try {
      // Use staticCall to ensure this is a read-only call (aggregate3 is payable)
      const results = await this.multicall.aggregate3.staticCall(calls);

      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const slot0Result = results[i * 2];
        const liquidityResult = results[i * 2 + 1];

        if (
          slot0Result.success &&
          liquidityResult.success &&
          slot0Result.returnData.length >= 64
        ) {
          try {
            // Decode sqrtPriceX96 and tick from slot0
            const slot0Data = slot0Result.returnData;
            const sqrtPriceX96 = BigInt("0x" + slot0Data.slice(2, 42));
            const tickHex = slot0Data.slice(42, 48);
            const tick = parseInt(tickHex, 16);
            // Handle negative tick (int24)
            const adjustedTick = tick > 0x7fffff ? tick - 0x1000000 : tick;

            // Decode liquidity
            const liquidity = BigInt(liquidityResult.returnData);

            updates.push({
              pool,
              reserve0: 0n, // V3 doesn't have traditional reserves
              reserve1: 0n,
              sqrtPriceX96,
              liquidity,
              tick: adjustedTick,
            });

            // Update pool in place
            pool.sqrtPriceX96 = sqrtPriceX96;
            pool.liquidity = liquidity;
            pool.tick = adjustedTick;

            // Cache the update
            await this.reserveCache.setReserves(chainId, pool.address, {
              reserve0: 0n,
              reserve1: 0n,
              sqrtPriceX96,
              liquidity,
              tick: adjustedTick,
            });
          } catch {
            // Decoding failed
          }
        }
      }
    } catch (err) {
      this.log.error({ chainId, err }, "Multicall failed for V3 pools");
    }

    return updates;
  }

  /**
   * Get cached reserves for a pool
   */
  async getCachedReserves(
    chainId: SupportedChainId,
    poolAddress: string
  ): Promise<ReserveUpdate | null> {
    try {
      const cached = await this.reserveCache.getReserves(chainId, poolAddress);
      if (cached) {
        return {
          pool: { address: poolAddress } as PoolInfo,
          reserve0: cached.reserve0,
          reserve1: cached.reserve1,
          sqrtPriceX96: cached.sqrtPriceX96,
          liquidity: cached.liquidity,
          tick: cached.tick,
        };
      }
    } catch {
      // Cache miss
    }
    return null;
  }
}
