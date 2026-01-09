import { CryptoNewsSource } from "@grep3/core";
import { BaseScraper, ScraperConfig } from "./BaseScraper";
import { RssScraper } from "./RssScraper";
import { CryptoPanicScraper } from "./CryptoPanicScraper";

export { BaseScraper, ScrapedItem, ScraperConfig } from "./BaseScraper";
export { RssScraper } from "./RssScraper";
export { CryptoPanicScraper } from "./CryptoPanicScraper";

export function createScraper(
  source: CryptoNewsSource,
  config?: ScraperConfig
): BaseScraper {
  switch (source.source_type) {
    case "rss":
      return new RssScraper(source, config);
    case "cryptopanic":
      return new CryptoPanicScraper(source, config);
    case "api":
      // Default to RSS scraper for generic API sources
      return new RssScraper(source, config);
    default:
      throw new Error(`Unknown source type: ${source.source_type}`);
  }
}

// Default news sources to seed
export const DEFAULT_SOURCES = [
  {
    name: "CoinDesk",
    source_type: "rss",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    config: null,
    is_active: true,
  },
  {
    name: "Decrypt",
    source_type: "rss",
    url: "https://decrypt.co/feed",
    config: null,
    is_active: true,
  },
  {
    name: "The Block",
    source_type: "rss",
    url: "https://www.theblock.co/rss.xml",
    config: null,
    is_active: true,
  },
  {
    name: "Cointelegraph",
    source_type: "rss",
    url: "https://cointelegraph.com/rss",
    config: null,
    is_active: true,
  },
  {
    name: "CryptoSlate",
    source_type: "rss",
    url: "https://cryptoslate.com/feed/",
    config: null,
    is_active: true,
  },
  {
    name: "CryptoPanic",
    source_type: "cryptopanic",
    url: "https://cryptopanic.com/api/v1/posts/",
    config: JSON.stringify({ apiToken: "" }), // Set via env var
    is_active: true,
  },
];
