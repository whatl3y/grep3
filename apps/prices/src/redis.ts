import { createRedisClient } from "@grep3/core";

const redisUrl = process.env.REDIS_URL;

let redis: ReturnType<typeof createRedisClient> | null = null;

export function getRedis() {
  if (!redis && redisUrl) {
    redis = createRedisClient(redisUrl);
  }
  return redis;
}

export default getRedis();
