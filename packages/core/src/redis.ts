import { Redis, RedisOptions } from "ioredis";

export interface CreateRedisClientOptions {
  /** If true, delay connection until first command is issued */
  lazyConnect?: boolean;
}

/**
 * Get Redis options with proper SSL configuration based on the connection URL.
 * - If URL starts with rediss:// (Redis with TLS), enable TLS with rejectUnauthorized: false
 *   to support self-signed certificates (common on Heroku, AWS ElastiCache, etc.)
 * - Otherwise, use standard connection without TLS
 */
export function getRedisOptions(redisUrl: string, options?: CreateRedisClientOptions): RedisOptions {
  const redisOptions: RedisOptions = {
    maxRetriesPerRequest: 3,
    lazyConnect: options?.lazyConnect,
  };

  // Heroku and other cloud providers use rediss:// for TLS connections
  // They often use self-signed certificates, so we need to disable certificate validation
  if (redisUrl.startsWith("rediss://")) {
    redisOptions.tls = { rejectUnauthorized: false };
  }

  return redisOptions;
}

/**
 * Create a Redis client with proper SSL configuration.
 * Automatically handles TLS for rediss:// URLs (e.g., Heroku Redis).
 */
export function createRedisClient(redisUrl: string, options?: CreateRedisClientOptions): Redis {
  const redisOptions = getRedisOptions(redisUrl, options);
  const redis = new Redis(redisUrl, redisOptions);

  redis.on("error", (err) => {
    console.error("Redis connection error:", err.message);
  });

  return redis;
}
