import assert from "assert";
import { Redis } from "ioredis";

assert(process.env.REDIS_URL, "redis connection string required");
export default new Redis(process.env.REDIS_URL);
