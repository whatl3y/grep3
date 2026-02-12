import Redis from "ioredis";
import { SupportedChainId } from "../config";

interface ReserveCacheOptions {
  redis: Redis;
  ttl?: number; // TTL in seconds
}

interface CachedReserves {
  reserve0: bigint;
  reserve1: bigint;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  tick?: number;
  timestamp: number;
}

/**
 * Redis cache for pool reserves
 * Uses short TTL since reserves change frequently
 */
export class ReserveCache {
  private redis: Redis;
  private ttl: number;
  private prefix = "arb:reserve";

  constructor(options: ReserveCacheOptions) {
    this.redis = options.redis;
    this.ttl = options.ttl || 2; // 2 seconds default (short for reserves)
  }

  /**
   * Cache reserves for a pool
   */
  async setReserves(
    chainId: SupportedChainId,
    poolAddress: string,
    reserves: Omit<CachedReserves, "timestamp">
  ): Promise<void> {
    const key = this.getKey(chainId, poolAddress);
    const data = this.serialize({
      ...reserves,
      timestamp: Date.now(),
    });
    await this.redis.set(key, data, "EX", this.ttl);
  }

  /**
   * Get cached reserves for a pool
   */
  async getReserves(
    chainId: SupportedChainId,
    poolAddress: string
  ): Promise<CachedReserves | null> {
    const key = this.getKey(chainId, poolAddress);
    const data = await this.redis.get(key);

    if (!data) return null;

    return this.deserialize(data);
  }

  /**
   * Batch set reserves for multiple pools
   */
  async setReservesBatch(
    chainId: SupportedChainId,
    updates: Array<{
      poolAddress: string;
      reserves: Omit<CachedReserves, "timestamp">;
    }>
  ): Promise<void> {
    if (updates.length === 0) return;

    const pipeline = this.redis.pipeline();
    const timestamp = Date.now();

    for (const update of updates) {
      const key = this.getKey(chainId, update.poolAddress);
      const data = this.serialize({
        ...update.reserves,
        timestamp,
      });
      pipeline.set(key, data, "EX", this.ttl);
    }

    await pipeline.exec();
  }

  /**
   * Batch get reserves for multiple pools
   */
  async getReservesBatch(
    chainId: SupportedChainId,
    poolAddresses: string[]
  ): Promise<Map<string, CachedReserves>> {
    if (poolAddresses.length === 0) return new Map();

    const keys = poolAddresses.map((addr) => this.getKey(chainId, addr));
    const results = await this.redis.mget(...keys);

    const reserves = new Map<string, CachedReserves>();

    for (let i = 0; i < poolAddresses.length; i++) {
      const data = results[i];
      if (data) {
        reserves.set(poolAddresses[i].toLowerCase(), this.deserialize(data));
      }
    }

    return reserves;
  }

  /**
   * Delete cached reserves for a pool
   */
  async deleteReserves(
    chainId: SupportedChainId,
    poolAddress: string
  ): Promise<void> {
    const key = this.getKey(chainId, poolAddress);
    await this.redis.del(key);
  }

  /**
   * Check if reserves are stale
   */
  async isStale(
    chainId: SupportedChainId,
    poolAddress: string,
    maxAgeMs: number
  ): Promise<boolean> {
    const reserves = await this.getReserves(chainId, poolAddress);

    if (!reserves) return true;

    return Date.now() - reserves.timestamp > maxAgeMs;
  }

  /**
   * Get reserve age in milliseconds
   */
  async getAge(
    chainId: SupportedChainId,
    poolAddress: string
  ): Promise<number | null> {
    const reserves = await this.getReserves(chainId, poolAddress);

    if (!reserves) return null;

    return Date.now() - reserves.timestamp;
  }

  /**
   * Clear all reserves for a chain
   */
  async clearChain(chainId: SupportedChainId): Promise<void> {
    const pattern = `${this.prefix}:${chainId}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Get stats about cached reserves
   */
  async getStats(chainId: SupportedChainId): Promise<{
    count: number;
    avgAge: number;
  }> {
    const pattern = `${this.prefix}:${chainId}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      return { count: 0, avgAge: 0 };
    }

    const values = await this.redis.mget(...keys);
    let totalAge = 0;
    let count = 0;

    for (const data of values) {
      if (data) {
        const reserves = this.deserialize(data);
        totalAge += Date.now() - reserves.timestamp;
        count++;
      }
    }

    return {
      count,
      avgAge: count > 0 ? totalAge / count : 0,
    };
  }

  private getKey(chainId: SupportedChainId, poolAddress: string): string {
    return `${this.prefix}:${chainId}:${poolAddress.toLowerCase()}`;
  }

  private serialize(reserves: CachedReserves): string {
    return JSON.stringify({
      reserve0: reserves.reserve0.toString(),
      reserve1: reserves.reserve1.toString(),
      sqrtPriceX96: reserves.sqrtPriceX96?.toString(),
      liquidity: reserves.liquidity?.toString(),
      tick: reserves.tick,
      timestamp: reserves.timestamp,
    });
  }

  private deserialize(data: string): CachedReserves {
    const parsed = JSON.parse(data);
    return {
      reserve0: BigInt(parsed.reserve0),
      reserve1: BigInt(parsed.reserve1),
      sqrtPriceX96: parsed.sqrtPriceX96 ? BigInt(parsed.sqrtPriceX96) : undefined,
      liquidity: parsed.liquidity ? BigInt(parsed.liquidity) : undefined,
      tick: parsed.tick,
      timestamp: parsed.timestamp,
    };
  }
}
