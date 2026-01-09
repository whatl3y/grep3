import { config } from "@grep3/core";

// Execution engine extends core config with app-specific overrides
export default {
  ...config,

  appName: "@grep3/execution-engine",

  server: {
    host: process.env.HOST || "http://localhost:8080",
    port: parseInt(process.env.PORT || "8080", 10),
  },
};
