import { Database } from "./types";
import { Pool, PoolConfig } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import config from "../config";

/**
 * Determine SSL configuration based on the connection string.
 * - If sslmode is explicitly set in the URL, respect it
 * - If the host is localhost or 127.0.0.1, disable SSL
 * - Otherwise (remote hosts like Heroku), enable SSL with rejectUnauthorized: false
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
    const host = url.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";

    if (isLocalhost) {
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
