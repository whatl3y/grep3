import { BaseScraper, ScraperResult } from "./BaseScraper";
import { ProfileData } from "../types";
import { fetchWebsiteWithBrowser } from "../libs/Browser";
import log from "../logger";

export class InstagramScraper extends BaseScraper {
  constructor() {
    super("instagram");
  }

  async scrape(identifier: string): Promise<ScraperResult> {
    const username = this.parseUsername(identifier);
    const profileUrl = `https://www.instagram.com/${username}/`;

    try {
      log.info(`Scraping Instagram profile: ${profileUrl}`);

      // Instagram is very restrictive with scraping
      // Most content requires login to view
      const result = await this.withTimeout(
        fetchWebsiteWithBrowser({
          url: profileUrl,
          waitForNetworkIdle: true,
          timeout: this.timeout,
          removeScripts: false, // Instagram relies heavily on JS
          removeCookieBanners: true,
        })
      );

      // Check for login wall
      if (
        result.html.includes("Log in") ||
        result.html.includes("Sign up") ||
        result.html.includes("loginForm")
      ) {
        // Instagram requires login - return graceful degradation
        return this.createErrorResult(
          "Instagram profile requires authentication - limited data available",
          username
        );
      }

      const profileData = this.parseInstagramHtml(result.html, username);

      // If we couldn't get any useful data, return an error
      if (!profileData.displayName && !profileData.bio) {
        return this.createErrorResult(
          "Instagram profile is private or restricted",
          username
        );
      }

      return this.createSuccessResult(profileData);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Instagram scrape error for ${username}: ${error.message}`);

      return this.createErrorResult(
        "Instagram profile could not be accessed - it may be private or require authentication",
        username
      );
    }
  }

  private parseInstagramHtml(html: string, username: string): ProfileData {
    let displayName: string | null = null;
    let bio: string | null = null;
    let profileImageUrl: string | null = null;
    let followerCount: number | null = null;
    let followingCount: number | null = null;
    let postCount: number | null = null;

    // Try to extract from meta tags (most reliable for public profiles)
    const titleMatch = html.match(
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
    );
    if (titleMatch && titleMatch[1]) {
      // Title is usually "Name (@username) • Instagram photos and videos"
      const title = titleMatch[1];
      const nameMatch = title.match(/^([^(]+)/);
      if (nameMatch) {
        displayName = nameMatch[1].trim();
      }
    }

    // Try og:description for bio
    const descMatch = html.match(
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
    );
    if (descMatch && descMatch[1]) {
      // Description often includes follower counts and bio
      const desc = descMatch[1];

      // Try to extract counts from description
      // Format: "123K Followers, 456 Following, 789 Posts - See Instagram photos..."
      const countMatch = desc.match(
        /([0-9,.]+[KMB]?)\s*Followers.*?([0-9,.]+[KMB]?)\s*Following.*?([0-9,.]+[KMB]?)\s*Posts/i
      );
      if (countMatch) {
        followerCount = this.parseCount(countMatch[1]);
        followingCount = this.parseCount(countMatch[2]);
        postCount = this.parseCount(countMatch[3]);
      }

      // Extract bio - usually after the dash
      const bioMatch = desc.match(/Posts\s*-\s*(.+)$/);
      if (bioMatch && bioMatch[1]) {
        bio = bioMatch[1]
          .replace(/See Instagram photos and videos.*$/i, "")
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
      platform: "instagram",
      username,
      displayName,
      bio,
      profileImageUrl,
      followerCount,
      followingCount,
      postCount,
      posts: [], // Instagram posts require authentication
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
let instance: InstagramScraper | null = null;

export function getInstagramScraper(): InstagramScraper {
  if (!instance) {
    instance = new InstagramScraper();
  }
  return instance;
}
