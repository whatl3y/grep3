import Logger from "bunyan";
import { SupportedChainId } from "../config";
import { IDexAdapter, PoolInfo } from "../types/dex";
import { PoolCache } from "../cache/PoolCache";

interface PoolScannerOptions {
  log: Logger;
  poolCache: PoolCache;
}

/**
 * Scans DEX factories to discover liquidity pools
 */
export class PoolScanner {
  private log: Logger;
  private poolCache: PoolCache;

  constructor(options: PoolScannerOptions) {
    this.log = options.log.child({ component: "PoolScanner" });
    this.poolCache = options.poolCache;
  }

  /**
   * Discover pools for given tokens across all provided adapters
   */
  async discoverPools(
    chainId: SupportedChainId,
    adapters: Map<string, IDexAdapter>,
    tokenAddresses: string[]
  ): Promise<PoolInfo[]> {
    const allPools: PoolInfo[] = [];
    const startTime = Date.now();

    this.log.info(
      { chainId, tokenCount: tokenAddresses.length, adapterCount: adapters.size },
      "Starting pool discovery"
    );

    // Discover pools from each DEX in parallel
    const discoveryPromises = Array.from(adapters.entries()).map(
      async ([dexName, adapter]) => {
        try {
          const pools = await adapter.discoverPools(tokenAddresses);

          // Cache discovered pools
          for (const pool of pools) {
            await this.poolCache.setPool(chainId, pool);
          }

          this.log.debug(
            { chainId, dexName, poolCount: pools.length },
            "Discovered pools from DEX"
          );

          return pools;
        } catch (err) {
          this.log.error(
            { chainId, dexName, err },
            "Failed to discover pools from DEX"
          );
          return [];
        }
      }
    );

    const results = await Promise.all(discoveryPromises);
    for (const pools of results) {
      allPools.push(...pools);
    }

    // Deduplicate by address
    const uniquePools = this.deduplicatePools(allPools);

    const elapsed = Date.now() - startTime;
    this.log.info(
      {
        chainId,
        totalPools: uniquePools.length,
        rawPools: allPools.length,
        elapsedMs: elapsed,
      },
      "Pool discovery completed"
    );

    return uniquePools;
  }

  /**
   * Scan for new pools containing a specific token pair
   */
  async scanPairPools(
    chainId: SupportedChainId,
    adapters: Map<string, IDexAdapter>,
    tokenA: string,
    tokenB: string
  ): Promise<PoolInfo[]> {
    return this.discoverPools(chainId, adapters, [tokenA, tokenB]);
  }

  /**
   * Get pools from cache, optionally refreshing if stale
   */
  async getCachedPools(
    chainId: SupportedChainId,
    forceRefresh = false
  ): Promise<PoolInfo[]> {
    if (forceRefresh) {
      return [];
    }

    try {
      return await this.poolCache.getPoolsForChain(chainId);
    } catch (err) {
      this.log.error({ chainId, err }, "Failed to get cached pools");
      return [];
    }
  }

  /**
   * Filter pools by minimum liquidity threshold
   */
  filterByLiquidity(pools: PoolInfo[], minLiquidityWei: bigint): PoolInfo[] {
    return pools.filter((pool) => {
      // For constant product pools, check reserve values
      if (pool.reserve0 && pool.reserve1) {
        // Use geometric mean of reserves as liquidity proxy
        const liquidity = this.sqrt(pool.reserve0 * pool.reserve1);
        return liquidity >= minLiquidityWei;
      }

      // For concentrated liquidity pools, check liquidity field
      if (pool.liquidity) {
        return pool.liquidity >= minLiquidityWei;
      }

      return true; // Include if we can't determine liquidity
    });
  }

  /**
   * Deduplicate pools by address
   */
  private deduplicatePools(pools: PoolInfo[]): PoolInfo[] {
    const seen = new Set<string>();
    return pools.filter((pool) => {
      const key = pool.address.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Integer square root using Newton's method
   */
  private sqrt(n: bigint): bigint {
    if (n < 0n) throw new Error("Square root of negative number");
    if (n === 0n) return 0n;

    let x = n;
    let y = (x + 1n) / 2n;

    while (y < x) {
      x = y;
      y = (x + n / x) / 2n;
    }

    return x;
  }
}
