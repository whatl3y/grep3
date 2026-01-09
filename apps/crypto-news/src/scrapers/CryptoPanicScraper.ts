import { CryptoNewsSource } from "@grep3/core";
import { BaseScraper, ScrapedItem, ScraperConfig } from "./BaseScraper";

interface CryptoPanicPost {
  id: number;
  kind: "news" | "media"; // "media" = social content (Twitter, Reddit, etc.)
  title: string;
  published_at: string;
  url: string;
  domain: string;
  source: {
    title: string;
    domain: string;
    path?: string;
  };
  votes: {
    positive: number;
    negative: number;
    important: number;
    liked: number;
    disliked: number;
    comments: number;
  };
  metadata?: {
    description?: string;
  };
  currencies?: Array<{
    code: string;
    title: string;
    slug: string;
  }>;
}

interface CryptoPanicResponse {
  count: number;
  results: CryptoPanicPost[];
  next?: string;
}

// Known Twitter/X domains that appear in CryptoPanic
const TWITTER_DOMAINS = ["twitter.com", "x.com", "nitter.net"];

// Known social media domains
const SOCIAL_DOMAINS = [
  ...TWITTER_DOMAINS,
  "reddit.com",
  "youtube.com",
  "t.me", // Telegram
  "discord.gg",
];

export class CryptoPanicScraper extends BaseScraper {
  private apiToken: string;

  constructor(source: CryptoNewsSource, config?: ScraperConfig) {
    super(source, config);
    const sourceConfig = this.parseSourceConfig();
    this.apiToken = sourceConfig.apiToken || process.env.CRYPTOPANIC_API_TOKEN || "";
  }

  /**
   * Check if a post is from Twitter/X
   */
  private isTwitterPost(post: CryptoPanicPost): boolean {
    const domain = post.domain?.toLowerCase() || post.source?.domain?.toLowerCase() || "";
    return TWITTER_DOMAINS.some((d) => domain.includes(d));
  }

  /**
   * Check if a post is from any social media platform
   */
  private isSocialPost(post: CryptoPanicPost): boolean {
    const domain = post.domain?.toLowerCase() || post.source?.domain?.toLowerCase() || "";
    return post.kind === "media" || SOCIAL_DOMAINS.some((d) => domain.includes(d));
  }

  /**
   * Calculate engagement score from votes
   */
  private getEngagementScore(post: CryptoPanicPost): number {
    const votes = post.votes || {};
    return (
      (votes.positive || 0) * 2 +
      (votes.important || 0) * 3 +
      (votes.liked || 0) +
      (votes.comments || 0) * 2 -
      (votes.negative || 0) -
      (votes.disliked || 0)
    );
  }

  async scrape(): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];

    if (!this.apiToken) {
      this.log("No CryptoPanic API token configured, skipping");
      return items;
    }

    try {
      // Fetch both news and media (social) content
      // kind: "news" = traditional news, "media" = social media posts
      // filter: "hot" = trending, "rising" = gaining traction, "important" = marked important by users
      const queries = [
        { kind: "news", filter: "hot" },
        { kind: "news", filter: "rising" },
        { kind: "media", filter: "hot" },      // Social media - trending
        { kind: "media", filter: "rising" },   // Social media - rising
        { kind: "media", filter: "important" }, // Social media - marked important
      ];

      for (const query of queries) {
        const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${this.apiToken}&kind=${query.kind}&filter=${query.filter}&public=true`;

        this.log(`Fetching CryptoPanic ${query.kind}/${query.filter} posts`);

        const response = await fetch(url, {
          headers: {
            "User-Agent": this.config.userAgent!,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: CryptoPanicResponse = await response.json();
        this.log(`Found ${data.results?.length || 0} ${query.kind}/${query.filter} posts`);

        for (const post of data.results || []) {
          // Skip if we already have this item
          if (items.some((i) => i.externalId === String(post.id))) {
            continue;
          }

          const isTwitter = this.isTwitterPost(post);
          const isSocial = this.isSocialPost(post);
          const engagement = this.getEngagementScore(post);

          // Build content with engagement info for social posts
          let content = post.metadata?.description || null;
          if (isSocial && engagement > 0) {
            const engagementInfo = `[Engagement: ${engagement}+ | ${post.votes?.positive || 0} bullish, ${post.votes?.negative || 0} bearish]`;
            content = content ? `${content}\n\n${engagementInfo}` : engagementInfo;
          }

          // Tag the source appropriately
          let sourceName = post.source?.title || "Unknown";
          if (isTwitter) {
            sourceName = `Twitter/X: ${sourceName}`;
          } else if (isSocial) {
            sourceName = `Social: ${sourceName}`;
          }

          items.push({
            externalId: String(post.id),
            title: post.title,
            content,
            url: post.url,
            author: sourceName,
            publishedAt: new Date(post.published_at),
          });
        }

        // Delay between requests
        await this.delay(this.config.minDelayMs!);
      }

      // Log breakdown of what we got
      const twitterCount = items.filter((i) => i.author?.includes("Twitter")).length;
      const socialCount = items.filter((i) => i.author?.includes("Social")).length;
      const newsCount = items.length - twitterCount - socialCount;

      this.log(
        `Successfully scraped ${items.length} items from CryptoPanic: ${newsCount} news, ${twitterCount} Twitter, ${socialCount} other social`
      );
    } catch (error: any) {
      this.logError(`Failed to scrape CryptoPanic: ${error.message}`, error);
      throw error;
    }

    return items;
  }
}
