import assert from "assert";
import { createRedisClient } from "@grep3/core";

assert(process.env.REDIS_URL, "REDIS_URL environment variable is required");

const redis = createRedisClient(process.env.REDIS_URL);

export default redis;
