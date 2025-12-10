import minimist from "minimist";
import { db } from "./database/database";
import Jobs from "./workers";
import log from "./logger";
import redis from "./redis";
import resqueFactory from "./resqueFactory";
import config from "./config";

const argv = minimist(process.argv.slice(2));

const queues =
  argv.q || argv.queue || argv.queues || config.resque.getAllQueues();
const queuesAry = typeof queues === "string" ? queues.split(",") : queues;

const jobs = Jobs.reduce(
  (obj, worker) => Object.assign(obj, worker({ log, db, redis })),
  {}
);

(async function resqueWorker() {
  const { worker } = resqueFactory({
    connection: { redis },
    jobs: jobs,
    queues: queuesAry,
  });

  const multiWorker = await worker();
  log.info(`Resque multi worker started...`);

  process.on("SIGINT", killProcess);
  process.on("SIGTERM", killProcess);

  async function killProcess() {
    await multiWorker.end();

    log.info("Shut down worker");
    process.exit();
  }
})();
