export { BaseScraper, ScraperResult } from "./BaseScraper";
export { TwitterScraper, getTwitterScraper } from "./TwitterScraper";
export { GitHubScraper, getGitHubScraper } from "./GitHubScraper";
export { LinkedInScraper, getLinkedInScraper } from "./LinkedInScraper";
export { FacebookScraper, getFacebookScraper } from "./FacebookScraper";
export { InstagramScraper, getInstagramScraper } from "./InstagramScraper";
export { TikTokScraper, getTikTokScraper } from "./TikTokScraper";
export { WebsiteScraper, getWebsiteScraper } from "./WebsiteScraper";

import { Platform, SocialLinksInput, ProfileData } from "../types";
import { getTwitterScraper } from "./TwitterScraper";
import { getGitHubScraper } from "./GitHubScraper";
import { getLinkedInScraper } from "./LinkedInScraper";
import { getFacebookScraper } from "./FacebookScraper";
import { getInstagramScraper } from "./InstagramScraper";
import { getTikTokScraper } from "./TikTokScraper";
import { getWebsiteScraper } from "./WebsiteScraper";
import { BaseScraper } from "./BaseScraper";
import log from "../logger";

// Map of platform to scraper getter
const scraperMap: Record<Platform, () => BaseScraper> = {
  twitter: getTwitterScraper,
  github: getGitHubScraper,
  linkedin: getLinkedInScraper,
  facebook: getFacebookScraper,
  instagram: getInstagramScraper,
  tiktok: getTikTokScraper,
  website: getWebsiteScraper,
};

/**
 * Get the scraper for a specific platform
 */
export function getScraperForPlatform(platform: Platform): BaseScraper {
  const getter = scraperMap[platform];
  if (!getter) {
    throw new Error(`No scraper available for platform: ${platform}`);
  }
  return getter();
}

/**
 * Scrape all provided social links in parallel
 */
export async function scrapeAllProfiles(
  socialLinks: SocialLinksInput,
  onProgress?: (platform: Platform, status: "scraping" | "success" | "failed") => void
): Promise<ProfileData[]> {
  const results: ProfileData[] = [];

  // Build list of platforms to scrape
  const platformsToScrape: Array<{ platform: Platform; identifier: string }> = [];

  const linkMapping: Array<[keyof SocialLinksInput, Platform]> = [
    ["twitter", "twitter"],
    ["linkedin", "linkedin"],
    ["facebook", "facebook"],
    ["instagram", "instagram"],
    ["tiktok", "tiktok"],
    ["github", "github"],
    ["website", "website"],
  ];

  for (const [key, platform] of linkMapping) {
    const identifier = socialLinks[key];
    if (identifier) {
      platformsToScrape.push({ platform, identifier });
    }
  }

  // Scrape all platforms in parallel
  const scrapePromises = platformsToScrape.map(async ({ platform, identifier }) => {
    try {
      onProgress?.(platform, "scraping");

      const scraper = getScraperForPlatform(platform);
      const result = await scraper.scrape(identifier);

      if (result.success && result.data) {
        onProgress?.(platform, "success");
        return result.data;
      } else {
        onProgress?.(platform, "failed");
        // Return the fallback data even on failure
        return result.data;
      }
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Error scraping ${platform}: ${error.message}`);
      onProgress?.(platform, "failed");

      // Return minimal profile on error
      return {
        platform,
        username: identifier,
        displayName: null,
        bio: null,
        profileImageUrl: null,
        followerCount: null,
        followingCount: null,
        postCount: null,
        posts: [],
        error: error.message,
        success: false,
      } as ProfileData;
    }
  });

  const profiles = await Promise.all(scrapePromises);

  // Filter out null results and return
  return profiles.filter((p): p is ProfileData => p !== null);
}
