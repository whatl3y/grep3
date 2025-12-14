import coreConfig from "@grep3/core/src/config";

// Web app extends core config with any web-specific overrides
export default {
  ...coreConfig,

  appName: "@grep/web",

  server: {
    host: process.env.HOST || "http://localhost:8080",
    port: process.env.PORT || 8080,
  },
};
