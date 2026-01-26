import { BaseScraper, ScraperResult } from "./BaseScraper";
import { ProfileData } from "../types";
import { fetchWebsiteWithBrowser } from "../libs/Browser";
import log from "../logger";

export class FacebookScraper extends BaseScraper {
  constructor() {
    super("facebook");
  }

  async scrape(identifier: string): Promise<ScraperResult> {
    let profileUrl = identifier;

    if (!identifier.includes("facebook.com")) {
      const username = this.parseUsername(identifier);
      profileUrl = `https://www.facebook.com/${username}`;
    }

    if (!profileUrl.startsWith("http")) {
      profileUrl = `https://${profileUrl}`;
    }

    const username = this.extractFacebookUsername(profileUrl);

    try {
      log.info(`Scraping Facebook profile: ${profileUrl}`);

      // Facebook heavily restricts scraping
      // Most profiles are private and require login
      const result = await this.withTimeout(
        fetchWebsiteWithBrowser({
          url: profileUrl,
          waitForNetworkIdle: true,
          timeout: this.timeout,
          removeScripts: true,
          removeCookieBanners: true,
        })
      );

      // Check if we hit a login wall
      if (
        result.html.includes("log in") ||
        result.html.includes("Log In") ||
        result.html.includes("sign up")
      ) {
        return this.createErrorResult(
          "Facebook profile requires authentication - only public pages can be accessed",
          username
        );
      }

      const profileData = this.parseFacebookHtml(result.html, username);

      return this.createSuccessResult(profileData);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Facebook scrape error for ${username}: ${error.message}`);

      return this.createErrorResult(
        "Facebook profile could not be accessed - it may be private or require authentication",
        username
      );
    }
  }

  private extractFacebookUsername(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      // Handle various Facebook URL formats
      // /username
      // /profile.php?id=123
      // /pages/PageName/123

      if (pathParts[0] === "profile.php") {
        const id = urlObj.searchParams.get("id");
        return id || "unknown";
      }

      if (pathParts[0] === "pages" && pathParts.length > 1) {
        return pathParts[1];
      }

      return pathParts[0] || url;
    } catch {
      return url;
    }
  }

  private parseFacebookHtml(html: string, username: string): ProfileData {
    let displayName: string | null = null;
    let bio: string | null = null;
    let profileImageUrl: string | null = null;

    // Try to extract name from title or meta tags
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      displayName = titleMatch[1]
        .replace(" | Facebook", "")
        .replace(" - Facebook", "")
        .trim();
    }

    // Try og:title
    const ogTitleMatch = html.match(
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
    );
    if (ogTitleMatch && ogTitleMatch[1]) {
      displayName = ogTitleMatch[1].trim();
    }

    // Try to extract description/bio from meta
    const descMatch = html.match(
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
    );
    if (descMatch && descMatch[1]) {
      bio = descMatch[1].trim();
    }

    // Try to extract profile image
    const imageMatch = html.match(
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i
    );
    if (imageMatch && imageMatch[1]) {
      profileImageUrl = imageMatch[1];
    }

    return {
      platform: "facebook",
      username,
      displayName,
      bio,
      profileImageUrl,
      followerCount: null,
      followingCount: null,
      postCount: null,
      posts: [], // Facebook posts require authentication
      error: null,
      success: true,
    };
  }
}

// Export singleton factory
let instance: FacebookScraper | null = null;

export function getFacebookScraper(): FacebookScraper {
  if (!instance) {
    instance = new FacebookScraper();
  }
  return instance;
}
