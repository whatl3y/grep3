import Redis from "ioredis";
import { SupportedChainId } from "../config";
import { PoolInfo } from "../types/dex";

interface PoolCacheOptions {
  redis: Redis;
  ttl?: number; // TTL in seconds
}

/**
 * Redis cache for pool data
 * Stores discovered pools with configurable TTL
 */
export class PoolCache {
  private redis: Redis;
  private ttl: number;
  private prefix = "arb:pool";

  constructor(options: PoolCacheOptions) {
    this.redis = options.redis;
    this.ttl = options.ttl || 3600; // 1 hour default
  }

  /**
   * Cache a pool
   */
  async setPool(chainId: SupportedChainId, pool: PoolInfo): Promise<void> {
    const key = this.getPoolKey(chainId, pool.address);
    const data = this.serializePool(pool);
    await this.redis.set(key, data, "EX", this.ttl);

    // Also add to chain's pool index
    const indexKey = this.getChainIndexKey(chainId);
    await this.redis.sadd(indexKey, pool.address.toLowerCase());
    await this.redis.expire(indexKey, this.ttl);
  }

  /**
   * Get a cached pool
   */
  async getPool(
    chainId: SupportedChainId,
    address: string
  ): Promise<PoolInfo | null> {
    const key = this.getPoolKey(chainId, address);
    const data = await this.redis.get(key);

    if (!data) return null;

    return this.deserializePool(data);
  }

  /**
   * Get all cached pools for a chain
   */
  async getPoolsForChain(chainId: SupportedChainId): Promise<PoolInfo[]> {
    const indexKey = this.getChainIndexKey(chainId);
    const addresses = await this.redis.smembers(indexKey);

    if (addresses.length === 0) return [];

    // Batch get all pools
    const keys = addresses.map((addr) => this.getPoolKey(chainId, addr));
    const results = await this.redis.mget(...keys);

    const pools: PoolInfo[] = [];
    for (const data of results) {
      if (data) {
        pools.push(this.deserializePool(data));
      }
    }

    return pools;
  }

  /**
   * Cache multiple pools
   */
  async setPoolsBatch(
    chainId: SupportedChainId,
    pools: PoolInfo[]
  ): Promise<void> {
    if (pools.length === 0) return;

    const pipeline = this.redis.pipeline();
    const addresses: string[] = [];

    for (const pool of pools) {
      const key = this.getPoolKey(chainId, pool.address);
      const data = this.serializePool(pool);
      pipeline.set(key, data, "EX", this.ttl);
      addresses.push(pool.address.toLowerCase());
    }

    // Update chain index
    const indexKey = this.getChainIndexKey(chainId);
    pipeline.sadd(indexKey, ...addresses);
    pipeline.expire(indexKey, this.ttl);

    await pipeline.exec();
  }

  /**
   * Delete a pool from cache
   */
  async deletePool(chainId: SupportedChainId, address: string): Promise<void> {
    const key = this.getPoolKey(chainId, address);
    await this.redis.del(key);

    const indexKey = this.getChainIndexKey(chainId);
    await this.redis.srem(indexKey, address.toLowerCase());
  }

  /**
   * Clear all pools for a chain
   */
  async clearChain(chainId: SupportedChainId): Promise<void> {
    const indexKey = this.getChainIndexKey(chainId);
    const addresses = await this.redis.smembers(indexKey);

    if (addresses.length > 0) {
      const keys = addresses.map((addr) => this.getPoolKey(chainId, addr));
      await this.redis.del(...keys, indexKey);
    }
  }

  /**
   * Get pool count for a chain
   */
  async getPoolCount(chainId: SupportedChainId): Promise<number> {
    const indexKey = this.getChainIndexKey(chainId);
    return this.redis.scard(indexKey);
  }

  /**
   * Check if a pool exists in cache
   */
  async hasPool(chainId: SupportedChainId, address: string): Promise<boolean> {
    const key = this.getPoolKey(chainId, address);
    return (await this.redis.exists(key)) === 1;
  }

  /**
   * Get pools containing a specific token
   */
  async getPoolsForToken(
    chainId: SupportedChainId,
    tokenAddress: string
  ): Promise<PoolInfo[]> {
    const allPools = await this.getPoolsForChain(chainId);
    const token = tokenAddress.toLowerCase();

    return allPools.filter(
      (pool) =>
        pool.token0.toLowerCase() === token ||
        pool.token1.toLowerCase() === token
    );
  }

  /**
   * Get pools for a token pair
   */
  async getPoolsForPair(
    chainId: SupportedChainId,
    tokenA: string,
    tokenB: string
  ): Promise<PoolInfo[]> {
    const allPools = await this.getPoolsForChain(chainId);
    const a = tokenA.toLowerCase();
    const b = tokenB.toLowerCase();

    return allPools.filter((pool) => {
      const t0 = pool.token0.toLowerCase();
      const t1 = pool.token1.toLowerCase();
      return (t0 === a && t1 === b) || (t0 === b && t1 === a);
    });
  }

  private getPoolKey(chainId: SupportedChainId, address: string): string {
    return `${this.prefix}:${chainId}:${address.toLowerCase()}`;
  }

  private getChainIndexKey(chainId: SupportedChainId): string {
    return `${this.prefix}:${chainId}:index`;
  }

  private serializePool(pool: PoolInfo): string {
    return JSON.stringify({
      ...pool,
      reserve0: pool.reserve0.toString(),
      reserve1: pool.reserve1.toString(),
      sqrtPriceX96: pool.sqrtPriceX96?.toString(),
      liquidity: pool.liquidity?.toString(),
    });
  }

  private deserializePool(data: string): PoolInfo {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      reserve0: BigInt(parsed.reserve0),
      reserve1: BigInt(parsed.reserve1),
      sqrtPriceX96: parsed.sqrtPriceX96 ? BigInt(parsed.sqrtPriceX96) : undefined,
      liquidity: parsed.liquidity ? BigInt(parsed.liquidity) : undefined,
    };
  }
}
