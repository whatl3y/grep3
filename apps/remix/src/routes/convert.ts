import { Request, Response } from "express";
import { IRoute } from "./index";
import { createOpenAIClient, remixWebsite } from "../libs/openai";
import { fetchWebsiteWithBrowser } from "../libs/Browser";
import config from "../config";
import log from "../logger";

export const convert: IRoute = {
  method: "get",
  path: "/*url",
  async handler(req: Request, res: Response) {
    try {
      // Extract the URL from the wildcard path parameter
      // Wildcard parameters return an array in Express 5, so we need to handle both cases
      const urlParam = req.params.url;
      const targetPath = Array.isArray(urlParam)
        ? urlParam.join("/")
        : urlParam || "";

      if (!targetPath || targetPath.trim() === "") {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Remix - Error</title></head>
          <body>
            <h1>Error: No URL provided</h1>
            <p>Please provide a URL in the path. Example: /${encodeURIComponent(
              "https://example.com"
            )}</p>
          </body>
          </html>
        `);
      }

      // Ensure the target is a valid URL
      let targetUrl: string;
      try {
        // If it doesn't start with http:// or https://, add https://
        if (
          !targetPath.startsWith("http://") &&
          !targetPath.startsWith("https://")
        ) {
          targetUrl = `https://${targetPath}`;
        } else {
          targetUrl = targetPath;
        }

        // Validate URL
        new URL(targetUrl);
      } catch (err) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Remix - Error</title></head>
          <body>
            <h1>Error: Invalid URL</h1>
            <p>The provided path "${targetPath}" is not a valid URL.</p>
            <p>Example: /${encodeURIComponent("https://example.com")}</p>
          </body>
          </html>
        `);
      }

      log.info(`Remixing ${targetUrl}...`);

      // Check for OpenAI API key
      if (!config.openai.apiKey) {
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Remix - Error</title></head>
          <body>
            <h1>Error: Configuration Missing</h1>
            <p>OPENAI_API_KEY environment variable is not set.</p>
          </body>
          </html>
        `);
      }

      // Fetch the target website content using headless browser
      // This ensures all JavaScript is executed and we get the final rendered HTML
      let websiteContent: string;
      let pageTitle: string;
      try {
        log.info(`Fetching ${targetUrl} with headless browser...`);
        const result = await fetchWebsiteWithBrowser({
          url: targetUrl,
          waitForNetworkIdle: true,
          timeout: 30000,
          removeScripts: true,
          removeCookieBanners: true,
        });

        websiteContent = result.html;
        pageTitle = result.title;
        log.info(`Successfully fetched: ${pageTitle}`);
      } catch (err: any) {
        log.error("Error fetching target URL with browser:", err);
        return res.status(502).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Remix - Error</title></head>
          <body>
            <h1>Error: Failed to fetch target website</h1>
            <p>Could not retrieve content from: ${targetUrl}</p>
            <p>Error: ${err.message}</p>
            <p>This could be due to:</p>
            <ul>
              <li>The website blocking automated browsers</li>
              <li>The website requiring authentication</li>
              <li>Network timeout (try a simpler page)</li>
              <li>Invalid or unreachable URL</li>
            </ul>
          </body>
          </html>
        `);
      }

      // Create OpenAI client and remix the website
      const openaiClient = createOpenAIClient({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
      });

      const remixedHtml = await remixWebsite(
        openaiClient,
        {
          targetUrl,
          style: "8bit", // Default to 8bit for now, can be made configurable later
          maxTokens: 16000,
        },
        websiteContent,
        config.openai.model
      );

      log.info(`Successfully remixed ${targetUrl}`);

      // Set appropriate content type and send the HTML
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(remixedHtml);
    } catch (err: any) {
      log.error("Error in convert route:", err);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Remix - Error</title></head>
        <body>
          <h1>Error: Remix Failed</h1>
          <p>An unexpected error occurred during remix. Please try again.</p>
        </body>
        </html>
      `);
    }
  },
};
