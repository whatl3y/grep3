import {
  IFactoryOptions,
  findActiveCryptoNewsSources,
  findCryptoNewsSourceById,
  updateCryptoNewsSource,
  createCryptoNewsItemIfNotExists,
  BackgroundWorker,
} from "@grep3/core";
import { createScraper } from "../scrapers";
import { getSummaryDateForTimestamp } from "../libs/dateUtils";
import config from "../config";

export default function ScrapeWorkers({ log, db, redis }: IFactoryOptions) {
  const worker = BackgroundWorker(redis);

  return {
    // Master job that queues individual source scrapes
    scrapeAllSources: {
      perform: async () => {
        log.info("Starting scrapeAllSources job");

        const sources = await findActiveCryptoNewsSources();
        log.info(`Found ${sources.length} active sources to scrape`);

        for (const source of sources) {
          await worker.enqueue(
            "scrapeSource",
            { sourceId: source.id },
            config.resque.scraping
          );
          log.debug(`Queued scrape job for source: ${source.name}`);
        }

        log.info(`Queued ${sources.length} scrape jobs`);
        return { sourcesQueued: sources.length };
      },
    },

    // Scrape a single source
    scrapeSource: {
      plugins: ["Retry"],
      pluginOptions: {
        retry: {
          retryLimit: 3,
          retryDelay: 1000 * 30, // 30 seconds
        },
      },
      perform: async ({ sourceId }: { sourceId: number }) => {
        const source = await findCryptoNewsSourceById(sourceId);
        if (!source) {
          log.warn(`Source ${sourceId} not found, skipping`);
          return { error: "Source not found" };
        }

        if (!source.is_active) {
          log.info(`Source ${source.name} is inactive, skipping`);
          return { skipped: true, reason: "inactive" };
        }

        log.info(`Starting scrape for source: ${source.name}`);

        try {
          const scraper = createScraper(source);
          const items = await scraper.scrape();

          log.info(`Scraped ${items.length} items from ${source.name}`);

          let newItemsCount = 0;
          let duplicatesCount = 0;

          for (const item of items) {
            const summaryDate = getSummaryDateForTimestamp(item.publishedAt);

            try {
              const newsItem = scraper.toNewsItem(item, summaryDate);
              const created = await createCryptoNewsItemIfNotExists(newsItem);

              // If we got back an item with the same external_id, it was a duplicate
              if (created.external_id === item.externalId && created.id) {
                // Check if this is a new insert by comparing created_at
                const isNew =
                  new Date().getTime() -
                    new Date(created.created_at).getTime() <
                  60000; // within last minute
                if (isNew) {
                  newItemsCount++;
                } else {
                  duplicatesCount++;
                }
              }
            } catch (err: any) {
              // Handle unique constraint violation (duplicate)
              if (err.code === "23505") {
                duplicatesCount++;
              } else {
                log.error(`Error saving item: ${item.title}`, err);
              }
            }
          }

          // Update last_scraped_at
          await updateCryptoNewsSource(sourceId, {
            last_scraped_at: new Date().toISOString(),
          });

          log.info(
            `Finished scraping ${source.name}: ${newItemsCount} new, ${duplicatesCount} duplicates`
          );

          return {
            success: true,
            source: source.name,
            totalItems: items.length,
            newItems: newItemsCount,
            duplicates: duplicatesCount,
          };
        } catch (err: any) {
          log.error(`Failed to scrape source ${source.name}`, err);
          throw err; // Let retry handle it
        }
      },
    },
  };
}
