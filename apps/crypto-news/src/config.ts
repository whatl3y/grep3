import { config } from "@grep3/core";

export default {
  ...config,

  appName: "@grep3/crypto-news",

  server: {
    host: process.env.HOST || "http://localhost:8001",
    port: parseInt(process.env.PORT || "8001", 10),
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    // gpt-4o supports JSON mode (response_format) which is required for scoring/summarization
    model: process.env.OPENAI_MODEL || "gpt-4o",
  },

  resque: {
    default: process.env.RESQUE_QUEUE || "crypto_news_default",
    scraping: "crypto_news_scraping",
    summarization: "crypto_news_summarization",

    getAllQueues() {
      return [this.default, this.scraping, this.summarization];
    },
  },

  scraping: {
    // Minimum delay between requests to the same domain (ms)
    minDelayMs: 2000,
    // Maximum requests per hour per source
    maxRequestsPerHour: 100,
    // Retry delay on failure (ms)
    retryDelayMs: 5000,
    // Max retries per source
    maxRetries: 3,
  },
};
