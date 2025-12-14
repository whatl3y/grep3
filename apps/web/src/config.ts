import { config } from "@grep3/core";

// Web app extends core config with any web-specific overrides
export default {
  ...config,

  appName: "@grep/web",

  server: {
    host: process.env.HOST || "http://localhost:8080",
    port: process.env.PORT || 8080,
  },
};
