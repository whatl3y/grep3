import assert from "assert";
import { IORedis } from "@grep3/core";

assert(process.env.REDIS_URL, "redis connection string required");
export default new IORedis(process.env.REDIS_URL);
