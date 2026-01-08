import path from "path";
import { config } from "@grep3/core";

// Engine app extends core config with any engine-specific overrides
export default {
  ...config,

  appName: "@grep/engine",

  server: {
    host: process.env.HOST || "http://localhost:8000",
    port: parseInt(process.env.PORT || "8000", 10),
  },

  // Git root directory - relative to this app, not the core package
  // This ensures it works correctly in Docker deploys where core is in node_modules
  gitRootDir: path.join(__dirname, "..", "tmp", "git"),
};
