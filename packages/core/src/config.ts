export default {
  aws: {
    bucket: process.env.AWS_BUCKET || "grep3",
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

    ecs: {
      region: process.env.ECS_REGION || "us-east-1",
      cluster: process.env.ECS_CLUSTER || "default",
      subnets: process.env.ECS_SUBNETS?.split(",") || [],
      securityGroups: process.env.ECS_SECURITY_GROUPS?.split(",") || [],
      assignPublicIp: process.env.ECS_ASSIGN_PUBLIC_IP !== "false",
      cpu: process.env.ECS_CPU || "256",
      memory: process.env.ECS_MEMORY || "512",
      logGroup: process.env.ECS_LOG_GROUP || "/ecs/grep3",
      taskRoleArn: process.env.ECS_TASK_ROLE_ARN,
      executionRoleArn: process.env.ECS_EXECUTION_ROLE_ARN,
    },
  },

  docker: {
    host: process.env.DOCKER_HOST || "http://localhost:2375",
  },

  fly: {
    flyApiToken: process.env.FLY_API_TOKEN,
    flyRegistryToken: process.env.FLY_REGISTRY_TOKEN,
    flyAppName: process.env.FLY_APP_NAME || "grep3",
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

  server: {
    host: process.env.HOST || "http://localhost:8000",
    port: process.env.PORT || 8000,
  },
};
