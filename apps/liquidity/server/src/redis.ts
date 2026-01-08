import { createRedisClient } from "@grep3/core";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redis = createRedisClient(redisUrl, { lazyConnect: true });

redis.on("connect", () => {
  console.log("Connected to Redis");
});

export default redis;
