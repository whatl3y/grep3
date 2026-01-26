import { Platform, ProfileData, PostData } from "../types";
import log from "../logger";
import config from "../config";

export interface ScraperResult {
  success: boolean;
  data: ProfileData | null;
  error: string | null;
}

export abstract class BaseScraper {
  protected platform: Platform;
  protected timeout: number;

  constructor(platform: Platform, timeout?: number) {
    this.platform = platform;
    this.timeout = timeout || config.scraping.timeout;
  }

  /**
   * Main scrape method - must be implemented by subclasses
   */
  abstract scrape(identifier: string): Promise<ScraperResult>;

  /**
   * Parse username from URL or handle
   */
  protected parseUsername(input: string): string {
    // Remove @ prefix if present
    if (input.startsWith("@")) {
      return input.substring(1);
    }

    // Try to extract username from URL
    try {
      const url = new URL(input);
      const pathParts = url.pathname.split("/").filter(Boolean);

      // Most social platforms have username as first path segment
      if (pathParts.length > 0) {
        // Handle special cases
        const username = pathParts[pathParts.length - 1];
        // Remove query strings or fragments
        return username.split("?")[0].split("#")[0];
      }
    } catch {
      // Not a URL, treat as username
    }

    return input;
  }

  /**
   * Create a timeout wrapper for promises
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const ms = timeoutMs || this.timeout;

    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Scraping timed out after ${ms}ms`)), ms)
      ),
    ]);
  }

  /**
   * Create an error result
   */
  protected createErrorResult(error: string, username: string): ScraperResult {
    log.warn(`Scraper error for ${this.platform}/${username}: ${error}`);

    return {
      success: false,
      data: this.createFallbackProfile(username, error),
      error,
    };
  }

  /**
   * Create a fallback profile with minimal data
   */
  protected createFallbackProfile(
    username: string,
    error: string
  ): ProfileData {
    return {
      platform: this.platform,
      username,
      displayName: null,
      bio: null,
      profileImageUrl: null,
      followerCount: null,
      followingCount: null,
      postCount: null,
      posts: [],
      error,
      success: false,
    };
  }

  /**
   * Create a successful result
   */
  protected createSuccessResult(data: ProfileData): ScraperResult {
    log.info(
      `Successfully scraped ${this.platform}/${data.username}: ${data.posts.length} posts`
    );

    return {
      success: true,
      data: { ...data, success: true, error: null },
      error: null,
    };
  }

  /**
   * Utility to safely parse a date string
   */
  protected parseDate(dateStr: string | undefined | null): Date {
    if (!dateStr) return new Date();
    try {
      return new Date(dateStr);
    } catch {
      return new Date();
    }
  }

  /**
   * Create a PostData object with defaults
   */
  protected createPost(partial: Partial<PostData> & { id: string; text: string }): PostData {
    return {
      id: partial.id,
      text: partial.text,
      timestamp: partial.timestamp || new Date(),
      likes: partial.likes || 0,
      comments: partial.comments || 0,
      shares: partial.shares || 0,
      mediaUrls: partial.mediaUrls || [],
      hashtags: partial.hashtags || [],
    };
  }

  /**
   * Delay helper for rate limiting
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
