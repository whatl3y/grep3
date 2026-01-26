import { BaseScraper, ScraperResult } from "./BaseScraper";
import { ProfileData } from "../types";
import { fetchWebsiteWithBrowser, extractPageText } from "../libs/Browser";
import log from "../logger";

export class LinkedInScraper extends BaseScraper {
  constructor() {
    super("linkedin");
  }

  async scrape(identifier: string): Promise<ScraperResult> {
    // LinkedIn URLs can be in various formats
    // https://www.linkedin.com/in/username
    // https://linkedin.com/in/username
    let profileUrl = identifier;

    if (!identifier.includes("linkedin.com")) {
      // Assume it's just a username
      const username = this.parseUsername(identifier);
      profileUrl = `https://www.linkedin.com/in/${username}`;
    }

    // Normalize URL
    if (!profileUrl.startsWith("http")) {
      profileUrl = `https://${profileUrl}`;
    }

    const username = this.extractLinkedInUsername(profileUrl);

    try {
      log.info(`Scraping LinkedIn profile: ${profileUrl}`);

      // LinkedIn heavily restricts scraping, so we'll try to get what we can
      // Most profiles require login to view full details
      const result = await this.withTimeout(
        fetchWebsiteWithBrowser({
          url: profileUrl,
          waitForNetworkIdle: true,
          timeout: this.timeout,
          removeScripts: true,
          removeCookieBanners: true,
        })
      );

      // Try to extract basic info from the HTML
      const profileData = this.parseLinkedInHtml(result.html, username);

      if (!profileData.displayName && !profileData.bio) {
        // LinkedIn likely blocked us or requires login
        return this.createErrorResult(
          "LinkedIn profile requires authentication to view - only limited public data available",
          username
        );
      }

      return this.createSuccessResult(profileData);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`LinkedIn scrape error for ${username}: ${error.message}`);

      // Check for common LinkedIn blocks
      if (
        error.message.includes("timeout") ||
        error.message.includes("navigation")
      ) {
        return this.createErrorResult(
          "LinkedIn blocked access - profile may require authentication",
          username
        );
      }

      return this.createErrorResult(error.message, username);
    }
  }

  private extractLinkedInUsername(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      // Find "in" segment and get the next part
      const inIndex = pathParts.indexOf("in");
      if (inIndex !== -1 && pathParts[inIndex + 1]) {
        return pathParts[inIndex + 1];
      }

      // Fallback to last path segment
      return pathParts[pathParts.length - 1] || url;
    } catch {
      return url;
    }
  }

  private parseLinkedInHtml(html: string, username: string): ProfileData {
    // Basic parsing - LinkedIn's HTML structure changes frequently
    // This extracts what's typically visible on public profiles

    let displayName: string | null = null;
    let bio: string | null = null;
    let profileImageUrl: string | null = null;

    // Try to extract name from various possible locations
    const namePatterns = [
      /<h1[^>]*class="[^"]*text-heading-xlarge[^"]*"[^>]*>([^<]+)<\/h1>/i,
      /<title>([^|<]+)/i,
      /class="[^"]*inline[^"]*t-24[^"]*"[^>]*>([^<]+)</i,
    ];

    for (const pattern of namePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        displayName = match[1].trim();
        // Clean up name from title (often "Name | LinkedIn")
        if (displayName.includes("|")) {
          displayName = displayName.split("|")[0].trim();
        }
        if (displayName.includes(" - ")) {
          displayName = displayName.split(" - ")[0].trim();
        }
        break;
      }
    }

    // Try to extract headline/bio
    const bioPatterns = [
      /class="[^"]*text-body-medium[^"]*break-words[^"]*"[^>]*>([^<]+)</i,
      /<div[^>]*class="[^"]*pv-text-details__left-panel[^"]*"[^>]*>.*?<div[^>]*class="[^"]*text-body-small[^"]*"[^>]*>([^<]+)</is,
    ];

    for (const pattern of bioPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        bio = match[1].trim();
        break;
      }
    }

    // Try to extract profile image
    const imagePatterns = [
      /class="[^"]*pv-top-card-profile-picture[^"]*"[^>]*src="([^"]+)"/i,
      /class="[^"]*profile-photo[^"]*"[^>]*src="([^"]+)"/i,
      /<img[^>]*class="[^"]*EntityPhoto[^"]*"[^>]*src="([^"]+)"/i,
    ];

    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        profileImageUrl = match[1];
        break;
      }
    }

    return {
      platform: "linkedin",
      username,
      displayName,
      bio,
      profileImageUrl,
      followerCount: null,
      followingCount: null,
      postCount: null,
      posts: [], // LinkedIn posts require authentication
      error: null,
      success: true,
    };
  }
}

// Export singleton factory
let instance: LinkedInScraper | null = null;

export function getLinkedInScraper(): LinkedInScraper {
  if (!instance) {
    instance = new LinkedInScraper();
  }
  return instance;
}
