import dotenv from "dotenv";
import resqueFactory from "./resqueFactory";
import log from "./logger";
import redis from "./redis";

dotenv.config({ quiet: true } as any);

(async function resqueScheduler() {
  const { scheduler } = resqueFactory({
    connection: { redis },
  });

  const schedulerDaemon = await scheduler();
  log.info(`Twitter Bot Resque scheduler started...`);

  process.on("SIGINT", killProcess);
  process.on("SIGTERM", killProcess);

  async function killProcess() {
    await schedulerDaemon.end();
    log.info("Shut down scheduler");
    process.exit();
  }
})();
