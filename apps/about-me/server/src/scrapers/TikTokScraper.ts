import { BaseScraper, ScraperResult } from "./BaseScraper";
import { ProfileData } from "../types";
import { fetchWebsiteWithBrowser } from "../libs/Browser";
import log from "../logger";

export class TikTokScraper extends BaseScraper {
  constructor() {
    super("tiktok");
  }

  async scrape(identifier: string): Promise<ScraperResult> {
    const username = this.parseUsername(identifier);
    // TikTok usernames start with @
    const profileUrl = `https://www.tiktok.com/@${username}`;

    try {
      log.info(`Scraping TikTok profile: ${profileUrl}`);

      // TikTok has aggressive bot detection
      const result = await this.withTimeout(
        fetchWebsiteWithBrowser({
          url: profileUrl,
          waitForNetworkIdle: true,
          timeout: this.timeout,
          removeScripts: false,
          removeCookieBanners: true,
        })
      );

      // Check for captcha or login requirements
      if (
        result.html.includes("captcha") ||
        result.html.includes("verify") ||
        result.html.includes("Please wait")
      ) {
        return this.createErrorResult(
          "TikTok requires verification - profile cannot be accessed automatically",
          username
        );
      }

      const profileData = this.parseTikTokHtml(result.html, username);

      if (!profileData.displayName && !profileData.bio) {
        return this.createErrorResult(
          "TikTok profile could not be accessed - it may be private or restricted",
          username
        );
      }

      return this.createSuccessResult(profileData);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`TikTok scrape error for @${username}: ${error.message}`);

      return this.createErrorResult(
        "TikTok profile could not be accessed - platform may be blocking automated access",
        username
      );
    }
  }

  private parseTikTokHtml(html: string, username: string): ProfileData {
    let displayName: string | null = null;
    let bio: string | null = null;
    let profileImageUrl: string | null = null;
    let followerCount: number | null = null;
    let followingCount: number | null = null;
    let postCount: number | null = null;

    // Try to extract from meta tags
    const titleMatch = html.match(
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
    );
    if (titleMatch && titleMatch[1]) {
      // Title is usually "Name (@username) TikTok | Watch Name's..."
      const title = titleMatch[1];
      const nameMatch = title.match(/^([^(]+)/);
      if (nameMatch) {
        displayName = nameMatch[1].trim();
      }
    }

    // Alternative title format
    const altTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (!displayName && altTitleMatch && altTitleMatch[1]) {
      const title = altTitleMatch[1];
      const nameMatch = title.match(/^([^(@|]+)/);
      if (nameMatch) {
        displayName = nameMatch[1].trim();
      }
    }

    // Try og:description for bio and stats
    const descMatch = html.match(
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
    );
    if (descMatch && descMatch[1]) {
      const desc = descMatch[1];

      // Try to extract follower count
      // Format varies: "123.4K Followers", "1.2M Followers"
      const followerMatch = desc.match(/([0-9.]+[KMB]?)\s*Followers/i);
      if (followerMatch) {
        followerCount = this.parseCount(followerMatch[1]);
      }

      const followingMatch = desc.match(/([0-9.]+[KMB]?)\s*Following/i);
      if (followingMatch) {
        followingCount = this.parseCount(followingMatch[1]);
      }

      const likesMatch = desc.match(/([0-9.]+[KMB]?)\s*Likes/i);
      if (likesMatch) {
        // TikTok shows likes instead of post count
        postCount = this.parseCount(likesMatch[1]);
      }

      // Bio is usually at the end after stats
      const bioParts = desc.split(/\.\s+/);
      if (bioParts.length > 1) {
        bio = bioParts[bioParts.length - 1].trim();
        // Remove common suffixes
        bio = bio
          .replace(/Watch the latest video.*$/i, "")
          .replace(/Discover the latest.*$/i, "")
          .trim();
      }
    }

    // Try og:image for profile picture
    const imageMatch = html.match(
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i
    );
    if (imageMatch && imageMatch[1]) {
      profileImageUrl = imageMatch[1];
    }

    return {
      platform: "tiktok",
      username,
      displayName,
      bio,
      profileImageUrl,
      followerCount,
      followingCount,
      postCount,
      posts: [], // TikTok videos require authentication
      error: null,
      success: true,
    };
  }

  private parseCount(countStr: string): number {
    let count = countStr.replace(/,/g, "");
    let multiplier = 1;

    if (count.includes("K")) {
      multiplier = 1000;
      count = count.replace("K", "");
    } else if (count.includes("M")) {
      multiplier = 1000000;
      count = count.replace("M", "");
    } else if (count.includes("B")) {
      multiplier = 1000000000;
      count = count.replace("B", "");
    }

    return Math.round(parseFloat(count) * multiplier);
  }
}

// Export singleton factory
let instance: TikTokScraper | null = null;

export function getTikTokScraper(): TikTokScraper {
  if (!instance) {
    instance = new TikTokScraper();
  }
  return instance;
}
