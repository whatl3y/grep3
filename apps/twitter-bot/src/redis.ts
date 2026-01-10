import assert from "assert";
import { createRedisClient } from "@grep3/core";

assert(process.env.REDIS_URL, "REDIS_URL connection string required");

export default createRedisClient(process.env.REDIS_URL);
