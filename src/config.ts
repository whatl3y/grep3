export default {
  appName: process.env.APP_NAME || "web3-compute",

  aws: {
    bucket: process.env.AWS_BUCKET || "web3-compute",
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  server: {
    host: process.env.HOST || "http://localhost:8000",
    port: process.env.PORT || 8000,
  },

  docker: {
    host: process.env.DOCKER_HOST || "http://localhost:2375",
  },

  logger: {
    level: process.env.LOG_LEVEL || "info",
  },

  postgres: {
    url: process.env.DATABASE_URL,
  },

  resque: {
    default: process.env.RESQUE_QUEUE || "web3-compute_resque_default",

    getAllQueues() {
      return [this.default];
    },
  },
};
