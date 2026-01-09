import Parser from "rss-parser";
import { CryptoNewsSource } from "@grep3/core";
import { BaseScraper, ScrapedItem, ScraperConfig } from "./BaseScraper";

const parser = new Parser({
  timeout: 30000,
  headers: {
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

export class RssScraper extends BaseScraper {
  constructor(source: CryptoNewsSource, config?: ScraperConfig) {
    super(source, config);
  }

  async scrape(): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];

    try {
      this.log(`Fetching RSS feed from ${this.source.url}`);
      const feed = await parser.parseURL(this.source.url);

      this.log(`Found ${feed.items?.length || 0} items in feed`);

      for (const item of feed.items || []) {
        // Skip items without required fields
        if (!item.title || !item.link) {
          continue;
        }

        // Generate external ID from guid or link
        const externalId =
          item.guid || item.id || Buffer.from(item.link).toString("base64");

        // Parse published date
        let publishedAt: Date;
        if (item.pubDate) {
          publishedAt = new Date(item.pubDate);
        } else if (item.isoDate) {
          publishedAt = new Date(item.isoDate);
        } else {
          publishedAt = new Date();
        }

        // Skip invalid dates
        if (isNaN(publishedAt.getTime())) {
          publishedAt = new Date();
        }

        // Extract content - prefer full content, fall back to summary
        const content =
          item["content:encoded"] ||
          item.content ||
          item.contentSnippet ||
          item.summary ||
          null;

        items.push({
          externalId,
          title: item.title.trim(),
          content: content ? this.stripHtml(content).trim() : null,
          url: item.link,
          author: item.creator || item.author || null,
          publishedAt,
        });
      }

      this.log(`Successfully scraped ${items.length} items`);
    } catch (error: any) {
      this.logError(`Failed to scrape RSS feed: ${error.message}`, error);
      throw error;
    }

    return items;
  }

  private stripHtml(html: string): string {
    // Basic HTML stripping - remove tags and decode entities
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}
