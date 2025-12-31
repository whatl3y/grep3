import { config } from "@grep3/core";

export default {
  ...config,

  appName: "@grep3/merkletree-api",

  server: {
    host: process.env.HOST || "http://localhost:8002",
    port: process.env.PORT || 8002,
  },

  resque: {
    ...config.resque,
    default: process.env.RESQUE_QUEUE || "merkletree_default",
  },
};
