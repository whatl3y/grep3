import { chromium, Browser, Page, Route } from "playwright";
import log from "../logger";

export interface IBrowserFetchOptions {
  url: string;
  waitForNetworkIdle?: boolean;
  timeout?: number;
  removeScripts?: boolean;
  removeCookieBanners?: boolean;
}

export interface IBrowserFetchResult {
  html: string;
  title: string;
  url: string;
}

export interface IBrowserManager {
  getBrowser(): Promise<Browser>;
  close(): Promise<void>;
}

/**
 * Create a browser manager that encapsulates the singleton browser instance
 * This avoids module-level state and provides a clean factory pattern
 */
function createBrowserManager(): IBrowserManager {
  let browserInstance: Browser | null = null;

  async function getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.isConnected()) {
      log.info("Launching new Playwright browser instance...");

      const launchOptions: any = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-extensions",
        ],
      };

      // Use system Chromium if available (set in Docker)
      if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
        log.info(`Using system Chromium at: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`);
      }

      browserInstance = await chromium.launch(launchOptions);
      log.info("Browser instance launched successfully");
    }
    return browserInstance;
  }

  async function close(): Promise<void> {
    if (browserInstance) {
      log.info("Closing browser instance...");
      await browserInstance.close();
      browserInstance = null;
      log.info("Browser instance closed");
    }
  }

  return { getBrowser, close };
}

// Create singleton manager instance via factory
const browserManager = createBrowserManager();

/**
 * Get or create a singleton browser instance
 * This reuses the browser across requests for better performance
 */
export async function getBrowserInstance(): Promise<Browser> {
  return browserManager.getBrowser();
}

/**
 * Fetch a website with a headless browser, allowing JavaScript to execute
 * and returning the fully rendered HTML
 */
export async function fetchWebsiteWithBrowser(
  options: IBrowserFetchOptions
): Promise<IBrowserFetchResult> {
  const {
    url,
    waitForNetworkIdle = true,
    timeout = 30000,
    removeScripts = true,
    removeCookieBanners = true,
  } = options;

  let page: Page | null = null;

  try {
    const browser = await getBrowserInstance();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    page = await context.newPage();

    // Block ads and tracking scripts to speed up page load
    await page.route("**/*", (route: Route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const requestUrl = request.url();

      // Block ads, trackers, and heavy media
      if (
        resourceType === "font" ||
        requestUrl.includes("googletagmanager") ||
        requestUrl.includes("google-analytics") ||
        requestUrl.includes("doubleclick") ||
        requestUrl.includes("facebook.com/tr") ||
        requestUrl.includes("ads")
      ) {
        route.abort();
      } else {
        route.continue();
      }
    });

    log.info(`Navigating to: ${url}`);

    // Navigate to the URL and wait for network to be idle
    await page.goto(url, {
      timeout,
      waitUntil: waitForNetworkIdle ? "networkidle" : "domcontentloaded",
    });

    log.info(`Page loaded: ${url}`);

    // Optional: Remove cookie banners and overlays
    if (removeCookieBanners) {
      await removeCookieBannersFromPage(page);
    }

    // Get the title
    const title = await page.title();

    // Get the fully rendered HTML
    let html = await page.content();

    // Optional: Remove script tags to reduce noise for AI
    if (removeScripts) {
      html = await page.evaluate(() => {
        // Remove script tags
        document.querySelectorAll("script").forEach((el) => el.remove());
        // Remove style tags (we'll let AI recreate styles)
        document.querySelectorAll("style").forEach((el) => el.remove());
        // Remove noscript tags
        document.querySelectorAll("noscript").forEach((el) => el.remove());
        // Remove comments
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_COMMENT
        );
        const comments: Node[] = [];
        let node;
        while ((node = walker.nextNode())) {
          comments.push(node);
        }
        comments.forEach((comment) => comment.parentNode?.removeChild(comment));

        return document.documentElement.outerHTML;
      });
    }

    log.info(`Successfully fetched and rendered: ${url}`);

    return {
      html,
      title,
      url,
    };
  } catch (err: any) {
    log.error(`Error fetching website with browser: ${err.message}`, err);
    throw err;
  } finally {
    if (page) {
      await page.close().catch((err: any) => {
        log.error("Error closing page:", err);
      });
    }
  }
}

/**
 * Remove common cookie banners and overlays that might interfere with content
 */
async function removeCookieBannersFromPage(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      // Common cookie banner selectors
      const cookieBannerSelectors = [
        '[class*="cookie"]',
        '[id*="cookie"]',
        '[class*="gdpr"]',
        '[id*="gdpr"]',
        '[class*="consent"]',
        '[id*="consent"]',
        '[class*="privacy-banner"]',
        '[id*="privacy-banner"]',
        ".cc-banner",
        "#onetrust-banner-sdk",
        ".cookie-notice",
      ];

      cookieBannerSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          (el as HTMLElement).remove();
        });
      });

      // Remove fixed/sticky elements that might be overlays
      document.querySelectorAll("*").forEach((el) => {
        const style = window.getComputedStyle(el as Element);
        if (
          style.position === "fixed" &&
          style.zIndex &&
          parseInt(style.zIndex) > 1000
        ) {
          (el as HTMLElement).remove();
        }
      });
    });
  } catch (err) {
    log.warn("Error removing cookie banners:", err);
    // Non-critical, continue
  }
}

/**
 * Close the browser instance
 * Call this on application shutdown
 */
export async function closeBrowser(): Promise<void> {
  await browserManager.close();
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});
