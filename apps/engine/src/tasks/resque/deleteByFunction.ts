import assert from "assert";
import minimist from "minimist";
import { Queue } from "@grep3/core";
import redis from "../../redis";
import config from "../../config";

const argv = minimist(process.argv.slice(2));
const queueName = argv.q || argv.queue || config.resque.default;
const jobClass = argv.c || argv.class || argv.f || argv.function;

(async function deleteByFunction() {
  try {
    assert(jobClass, "job class/function required");

    const queue = new Queue({
      connection: { redis },
    });
    await queue.connect();

    const numJobs = await queue.delByFunction(queueName, jobClass);
    await queue.end();

    console.log(
      `Successfully removed ${numJobs} from queue '${queueName}' for class/function '${jobClass}'.`
    );
  } catch (err) {
    console.error(`Error deleting jobs by class/function`, err);
  } finally {
    process.exit();
  }
})();
