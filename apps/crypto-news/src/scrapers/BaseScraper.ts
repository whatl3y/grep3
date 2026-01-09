import { CryptoNewsSource, NewCryptoNewsItem } from "@grep3/core";
import log from "../logger";

export interface ScrapedItem {
  externalId: string;
  title: string;
  content: string | null;
  url: string;
  author: string | null;
  publishedAt: Date;
}

export interface ScraperConfig {
  minDelayMs?: number;
  maxRequestsPerHour?: number;
  retryDelayMs?: number;
  maxRetries?: number;
  userAgent?: string;
}

export abstract class BaseScraper {
  protected source: CryptoNewsSource;
  protected config: ScraperConfig;

  constructor(source: CryptoNewsSource, config?: ScraperConfig) {
    this.source = source;
    this.config = {
      minDelayMs: 2000,
      maxRequestsPerHour: 100,
      retryDelayMs: 5000,
      maxRetries: 3,
      userAgent: "CryptoNewsAggregator/1.0 (compatible; news aggregator)",
      ...config,
    };
  }

  abstract scrape(): Promise<ScrapedItem[]>;

  protected log(message: string, ...args: any[]) {
    log.info(`[${this.source.name}] ${message}`, ...args);
  }

  protected logError(message: string, error: any) {
    log.error(`[${this.source.name}] ${message}`, error);
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected parseSourceConfig(): Record<string, any> {
    if (!this.source.config) return {};
    try {
      return JSON.parse(this.source.config);
    } catch {
      return {};
    }
  }

  toNewsItem(item: ScrapedItem, summaryDate: string): NewCryptoNewsItem {
    return {
      source_id: this.source.id,
      external_id: item.externalId,
      title: item.title,
      content: item.content,
      url: item.url,
      author: item.author,
      published_at: item.publishedAt.toISOString(),
      summary_date: summaryDate,
    };
  }
}
