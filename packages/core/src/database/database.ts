import { Database } from "./types";
import { Pool, PoolConfig } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import config from "../config";

/**
 * Check if a hostname is a local/development environment that doesn't require SSL.
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
 * Determine SSL configuration based on the connection string.
 * - If sslmode is explicitly set in the URL, respect it
 * - If the host is local/Docker (localhost, service names, private IPs), disable SSL
 * - Otherwise (remote hosts like Heroku, AWS RDS), enable SSL with rejectUnauthorized: false
 */
export function getPoolConfig(connectionString: string): PoolConfig {
  const poolConfig: PoolConfig = { connectionString };

  // Check if sslmode is explicitly set in connection string
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");

  if (sslmode === "disable") {
    // Explicitly disabled
    poolConfig.ssl = false;
  } else if (sslmode) {
    // sslmode is set (require, verify-ca, verify-full, etc.)
    poolConfig.ssl = { rejectUnauthorized: false };
  } else {
    // No explicit sslmode - infer based on host
    if (isLocalOrDockerHost(url.hostname)) {
      poolConfig.ssl = false;
    } else {
      // Remote host - assume SSL required (e.g., Heroku, AWS RDS)
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  }

  return poolConfig;
}

let _db: Kysely<Database> | null = null;

function getDb(): Kysely<Database> {
  if (!_db) {
    if (!config.postgres.url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const dialect = new PostgresDialect({
      pool: new Pool(getPoolConfig(config.postgres.url)),
    });
    _db = new Kysely<Database>({ dialect });
  }
  return _db;
}

export const db: Kysely<Database> = new Proxy({} as Kysely<Database>, {
  get(_target, prop) {
    const instance = getDb();
    const value = (instance as any)[prop];
    // Bind methods to the actual Kysely instance to preserve `this` context
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
