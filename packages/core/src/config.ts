export default {
  aws: {
    bucket: process.env.AWS_BUCKET || "grep3",
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
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
    default: process.env.RESQUE_QUEUE || "grep3_resque_default",

    getAllQueues() {
      return [this.default];
    },
  },
};
