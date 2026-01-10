import minimist from "minimist";
import { BackgroundWorker } from "@grep3/core";
import redis from "../../redis";
import config from "../../config";

const argv = minimist(process.argv.slice(2));
const job = argv.j || argv.job;
const arg = argv.a || argv.arg;
const queueName = argv.q || argv.queue || config.resque.default;

(async function queueJob() {
  try {
    const allJobArgs = (arg instanceof Array ? arg : [arg]).reduce(
      (obj: any, argStr: null | string) => {
        if (!argStr) return obj;
        const [key, val] = argStr.split("=");
        return {
          ...obj,
          [key]: val,
        };
      },
      {}
    );

    await BackgroundWorker(redis).enqueue(job, allJobArgs, queueName);

    console.log(`Successfully queued job '${job}' to queue '${queueName}'`);
  } catch (err) {
    console.error("Error queueing job", err);
  } finally {
    process.exit();
  }
})();
