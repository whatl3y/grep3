import { Database } from "./types";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import config from "../config";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: config.postgres.url,
  }),
});

export const db = new Kysely<Database>({
  dialect,
});
