import dotenv from "dotenv";
import { migrateToLatest } from "@grep3/core";
import log from "../logger";

dotenv.config({ quiet: true } as any);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  log.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

(async function migrate() {
  await migrateToLatest({ databaseUrl, log });
  log.info("Migrations complete");
  process.exit(0);
})();
