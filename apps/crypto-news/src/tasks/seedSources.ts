import dotenv from "dotenv";
import {
  findCryptoNewsSources,
  createCryptoNewsSource,
} from "@grep3/core";
import { DEFAULT_SOURCES } from "../scrapers";
import log from "../logger";

dotenv.config({ quiet: true } as any);

(async function seedSources() {
  log.info("Seeding default news sources...");

  for (const sourceData of DEFAULT_SOURCES) {
    // Check if source already exists by name
    const existing = await findCryptoNewsSources({ name: sourceData.name });

    if (existing.length > 0) {
      log.info(`Source "${sourceData.name}" already exists, skipping`);
      continue;
    }

    try {
      const created = await createCryptoNewsSource(sourceData);
      log.info(`Created source: ${created.name} (id: ${created.id})`);
    } catch (err: any) {
      log.error(`Failed to create source "${sourceData.name}"`, err);
    }
  }

  log.info("Finished seeding sources");
  process.exit(0);
})();
