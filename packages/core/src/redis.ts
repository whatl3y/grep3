import { Redis, RedisOptions } from "ioredis";

export interface CreateRedisClientOptions {
  /** If true, delay connection until first command is issued */
  lazyConnect?: boolean;
}

/**
 * Check if a hostname is a local/development environment that doesn't require TLS.
 * This includes:
 * - localhost, 127.0.0.1, ::1
 * - Docker Compose service names (simple hostnames without dots)
 * - Private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
 */
function isLocalOrDockerHost(host: string): boolean {
  // Standard localhost
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }

  // Docker Compose service names are simple hostnames without dots
  // e.g., "postgres", "redis", "db"
  if (!host.includes(".")) {
    return true;
  }

  // Check for private IP ranges
  const ipParts = host.split(".").map(Number);
  if (ipParts.length === 4 && ipParts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    // 10.0.0.0/8
    if (ipParts[0] === 10) return true;
    // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;
    // 192.168.0.0/16
    if (ipParts[0] === 192 && ipParts[1] === 168) return true;
  }

  return false;
}

/**
 * Get Redis options with proper TLS configuration based on the connection URL.
 * - If URL starts with rediss:// (Redis with TLS), enable TLS with rejectUnauthorized: false
 *   to support self-signed certificates (common on Heroku, AWS ElastiCache, etc.)
 * - For local/Docker hosts (localhost, service names, private IPs), never use TLS
 * - Otherwise, use standard connection without TLS
 */
export function getRedisOptions(redisUrl: string, options?: CreateRedisClientOptions): RedisOptions {
  const redisOptions: RedisOptions = {
    maxRetriesPerRequest: 3,
    lazyConnect: options?.lazyConnect,
  };

  // Parse the URL to check the host
  try {
    const url = new URL(redisUrl);

    // Never use TLS for local/Docker environments, even if rediss:// is specified
    if (isLocalOrDockerHost(url.hostname)) {
      return redisOptions;
    }
  } catch {
    // If URL parsing fails, fall through to the simple check
  }

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
