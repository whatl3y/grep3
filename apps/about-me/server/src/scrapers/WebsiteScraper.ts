import { BaseScraper, ScraperResult } from "./BaseScraper";
import { ProfileData, WebsiteContent, PostData } from "../types";
import { fetchWebsiteWithBrowser, extractPageText } from "../libs/Browser";
import log from "../logger";

export class WebsiteScraper extends BaseScraper {
  constructor() {
    super("website");
  }

  async scrape(identifier: string): Promise<ScraperResult> {
    let url = identifier;

    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    try {
      log.info(`Scraping personal website: ${url}`);

      const result = await this.withTimeout(
        fetchWebsiteWithBrowser({
          url,
          waitForNetworkIdle: true,
          timeout: this.timeout,
          removeScripts: true,
          removeCookieBanners: true,
        })
      );

      // Also get plain text for content analysis
      const textContent = await this.withTimeout(extractPageText(url, this.timeout));

      const websiteContent = this.parseWebsiteContent(result.html, textContent, url);
      const profileData = this.createWebsiteProfile(url, result.title, websiteContent);

      return this.createSuccessResult(profileData);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Website scrape error for ${url}: ${error.message}`);

      if (error.message.includes("timeout")) {
        return this.createErrorResult(
          "Website took too long to load",
          this.extractDomain(url)
        );
      }

      if (error.message.includes("net::ERR")) {
        return this.createErrorResult(
          "Website could not be reached - check if the URL is correct",
          this.extractDomain(url)
        );
      }

      return this.createErrorResult(
        `Could not access website: ${error.message}`,
        this.extractDomain(url)
      );
    }
  }

  private parseWebsiteContent(
    html: string,
    textContent: string,
    url: string
  ): WebsiteContent {
    let title: string | null = null;
    let description: string | null = null;

    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    // Try og:title
    const ogTitleMatch = html.match(
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
    );
    if (!title && ogTitleMatch) {
      title = ogTitleMatch[1].trim();
    }

    // Extract description
    const descMatch = html.match(
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/i
    );
    if (descMatch && descMatch[1]) {
      description = descMatch[1].trim();
    }

    // Try og:description
    const ogDescMatch = html.match(
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
    );
    if (!description && ogDescMatch) {
      description = ogDescMatch[1].trim();
    }

    // Extract links
    const links: string[] = [];
    const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      // Only include external links or important internal links
      if (
        href.startsWith("http") &&
        !href.includes(this.extractDomain(url))
      ) {
        links.push(href);
      }
    }

    // Extract images
    const images: string[] = [];
    const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1];
      // Filter out tiny images and tracking pixels
      if (src.startsWith("http") && !src.includes("1x1") && !src.includes("pixel")) {
        images.push(src);
      }
    }

    // Clean up text content
    const mainContent = textContent
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 5000); // Limit content length for analysis

    return {
      title,
      description,
      mainContent,
      links: [...new Set(links)].slice(0, 20),
      images: [...new Set(images)].slice(0, 10),
    };
  }

  private createWebsiteProfile(
    url: string,
    pageTitle: string,
    content: WebsiteContent
  ): ProfileData {
    const domain = this.extractDomain(url);

    // Create synthetic "posts" from website sections for analysis
    const posts: PostData[] = [];

    // Use the main content as a "post"
    if (content.mainContent) {
      // Split into paragraphs/sections
      const sections = content.mainContent.split(/[.!?]\s+/).filter((s) => s.length > 50);

      for (let i = 0; i < Math.min(sections.length, 5); i++) {
        posts.push(
          this.createPost({
            id: `website-section-${i}`,
            text: sections[i].trim(),
            timestamp: new Date(),
          })
        );
      }
    }

    return {
      platform: "website",
      username: domain,
      displayName: content.title || pageTitle || domain,
      bio: content.description,
      profileImageUrl: content.images[0] || null,
      followerCount: null,
      followingCount: null,
      postCount: null,
      posts,
      websiteContent: content,
      error: null,
      success: true,
    };
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }
}

// Export singleton factory
let instance: WebsiteScraper | null = null;

export function getWebsiteScraper(): WebsiteScraper {
  if (!instance) {
    instance = new WebsiteScraper();
  }
  return instance;
}
