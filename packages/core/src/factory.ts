import bunyan from "bunyan";
import IORedis from "ioredis";
import { Kysely } from "kysely";
import { Database } from "./database/types";

export interface IFactoryOptions {
  db: Kysely<Database>;
  log: bunyan;
  redis: IORedis;
}
