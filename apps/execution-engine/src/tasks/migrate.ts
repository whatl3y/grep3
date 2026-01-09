import { migrateToLatest } from "@grep3/core";
import log from "../logger";
import config from "../config";

(async function runMigrations() {
  if (!config.postgres.url) {
    log.error("DATABASE_URL is required");
    process.exit(1);
  }

  await migrateToLatest({
    databaseUrl: config.postgres.url,
    log,
  });
})();
