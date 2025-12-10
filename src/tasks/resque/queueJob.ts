import minimist from "minimist";
import BackgroundWorker from "../../libs/BackgroundWorker";
import redis from "../../redis";

const argv = minimist(process.argv.slice(2));
const job = argv.j || argv.job;
const arg = argv.a || argv.arg;

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

    await BackgroundWorker(redis).enqueue(job, allJobArgs);

    console.log(`successfully queued job`, job);
  } catch (err) {
    console.error("error queueing job", err);
  } finally {
    process.exit();
  }
})();
