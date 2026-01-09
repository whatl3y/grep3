import dotenv from "dotenv";
import minimist from "minimist";
import {
  findActiveCryptoNewsSources,
  createCryptoNewsItemIfNotExists,
} from "@grep3/core";
import { createScraper } from "../scrapers";
import { generateDailySummary } from "../services/SummaryService";
import {
  getTodayUTC,
  subtractDays,
  getSummaryDateForTimestamp,
  parseDate,
} from "../libs/dateUtils";
import log from "../logger";

dotenv.config({ quiet: true } as any);

const argv = minimist(process.argv.slice(2));

// Usage:
//   npm run backfill -- --days 7                    # Backfill last 7 days
//   npm run backfill -- --from 2026-01-01 --to 2026-01-07  # Specific date range
//   npm run backfill -- --days 7 --scrape-only      # Only scrape, don't generate summaries
//   npm run backfill -- --days 7 --summarize-only   # Only generate summaries (use existing items)

interface BackfillOptions {
  fromDate: string;
  toDate: string;
  scrapeOnly: boolean;
  summarizeOnly: boolean;
}

function parseOptions(): BackfillOptions {
  const today = getTodayUTC();

  let fromDate: string;
  let toDate: string;

  if (argv.from && argv.to) {
    fromDate = argv.from;
    toDate = argv.to;
  } else if (argv.days) {
    const days = parseInt(argv.days, 10);
    fromDate = subtractDays(today, days - 1);
    toDate = today;
  } else {
    // Default to last 3 days
    fromDate = subtractDays(today, 2);
    toDate = today;
  }

  return {
    fromDate,
    toDate,
    scrapeOnly: argv["scrape-only"] || false,
    summarizeOnly: argv["summarize-only"] || false,
  };
}

function getDateRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const from = parseDate(fromDate);
  const to = parseDate(toDate);

  const current = new Date(from);
  while (current <= to) {
    dates.push(
      `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`
    );
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

async function scrapeAllSources(): Promise<number> {
  const sources = await findActiveCryptoNewsSources();
  log.info(`Found ${sources.length} active sources to scrape`);

  let totalNewItems = 0;

  for (const source of sources) {
    try {
      log.info(`Scraping source: ${source.name}`);
      const scraper = createScraper(source);
      const items = await scraper.scrape();

      log.info(`Got ${items.length} items from ${source.name}`);

      let newItems = 0;
      for (const item of items) {
        const summaryDate = getSummaryDateForTimestamp(item.publishedAt);

        try {
          const newsItem = scraper.toNewsItem(item, summaryDate);
          await createCryptoNewsItemIfNotExists(newsItem);
          newItems++;
        } catch (err: any) {
          if (err.code !== "23505") {
            // Ignore duplicate key errors
            log.error(`Error saving item: ${item.title}`, err);
          }
        }
      }

      totalNewItems += newItems;
      log.info(`Saved ${newItems} new items from ${source.name}`);

      // Small delay between sources to be polite
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err: any) {
      log.error(`Failed to scrape ${source.name}`, err);
    }
  }

  return totalNewItems;
}

async function generateSummariesForDates(dates: string[]): Promise<void> {
  for (const date of dates) {
    try {
      log.info(`Generating summary for ${date}...`);
      const result = await generateDailySummary(date);

      if (result.success) {
        log.info(
          `Generated summary for ${date}: ${result.eventCount} events, ${result.tokensUsed} tokens`
        );
      } else {
        log.info(`No items found for ${date}, skipping summary`);
      }
    } catch (err: any) {
      log.error(`Failed to generate summary for ${date}`, err);
    }

    // Small delay between API calls
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

(async function backfill() {
  const options = parseOptions();

  log.info("=== Crypto News Backfill ===");
  log.info(`Date range: ${options.fromDate} to ${options.toDate}`);
  log.info(`Scrape only: ${options.scrapeOnly}`);
  log.info(`Summarize only: ${options.summarizeOnly}`);

  const dates = getDateRange(options.fromDate, options.toDate);
  log.info(`Processing ${dates.length} days: ${dates.join(", ")}`);

  // Step 1: Scrape all sources (unless summarize-only)
  if (!options.summarizeOnly) {
    log.info("\n--- Scraping sources ---");
    const newItems = await scrapeAllSources();
    log.info(`Total new items scraped: ${newItems}`);
  }

  // Step 2: Generate summaries for each date (unless scrape-only)
  if (!options.scrapeOnly) {
    log.info("\n--- Generating summaries ---");
    await generateSummariesForDates(dates);
  }

  log.info("\n=== Backfill complete ===");
  process.exit(0);
})();
