import coreConfig from "@grep3/core/src/config";

// Engine app extends core config with any engine-specific overrides
export default {
  ...coreConfig,

  appName: "@grep/engine",

  server: {
    host: process.env.HOST || "http://localhost:8000",
    port: process.env.PORT || 8000,
  },
};
