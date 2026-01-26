import { config } from "@grep3/core";

export default {
  ...config,

  appName: "@grep3/about-me",

  server: {
    host: process.env.HOST || "http://localhost:8020",
    port: parseInt(process.env.PORT || "8020", 10),
  },

  twitter: {
    bearerToken: process.env.TWITTER_BEARER_TOKEN,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o",
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  },

  github: {
    token: process.env.GITHUB_TOKEN, // Optional - increases rate limits
  },

  scraping: {
    timeout: parseInt(process.env.SCRAPE_TIMEOUT || "30000", 10),
    maxPostsPerPlatform: parseInt(process.env.MAX_POSTS || "20", 10),
  },

  sessions: {
    ttlMinutes: parseInt(process.env.SESSION_TTL || "30", 10),
  },
};
