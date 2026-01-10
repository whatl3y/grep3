import { config } from "@grep3/core";

export default {
  ...config,

  appName: "@grep3/twitter-bot",

  server: {
    host: process.env.HOST || "http://localhost:8010",
    port: parseInt(process.env.PORT || "8010", 10),
  },

  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
    bearerToken: process.env.TWITTER_BEARER_TOKEN,
    username: process.env.TWITTER_USERNAME,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  },

  posting: {
    tweetsPerDay: parseInt(process.env.TWEETS_PER_DAY || "3", 10),
    minHoursBetweenPosts: parseInt(process.env.MIN_HOURS_BETWEEN_POSTS || "4", 10),
    maxTweetsToAnalyze: parseInt(process.env.MAX_TWEETS_TO_ANALYZE || "500", 10),
    topics: (process.env.TOPICS || "software development,crypto,web3")
      .split(",")
      .map((t) => t.trim()),
    autoPost: process.env.AUTO_POST === "true",
  },

  resque: {
    default: process.env.RESQUE_QUEUE || "twitter_bot_default",
    generation: "twitter_bot_generation",
    posting: "twitter_bot_posting",
    analysis: "twitter_bot_analysis",

    getAllQueues() {
      return [this.default, this.generation, this.posting, this.analysis];
    },
  },

  // Optimal posting times based on Twitter algorithm research
  // Times are in UTC, will be adjusted based on engagement patterns
  optimalPostingHours: [9, 12, 15, 18, 21], // 9am, 12pm, 3pm, 6pm, 9pm UTC
};
