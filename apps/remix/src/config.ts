import { config } from "@grep3/core";

export default {
  ...config,

  appName: "@grep3/remix",

  server: {
    host: process.env.HOST || "http://localhost:8088",
    port: process.env.PORT || 8088,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o",
  },
};
