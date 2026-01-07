import { Database } from "./types";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import config from "../config";

let _db: Kysely<Database> | null = null;

export const db: Kysely<Database> = new Proxy({} as Kysely<Database>, {
  get(_target, prop) {
    if (!_db) {
      const dialect = new PostgresDialect({
        pool: new Pool({
          connectionString: config.postgres.url,
        }),
      });
      _db = new Kysely<Database>({ dialect });
    }
    return (_db as any)[prop];
  },
});
