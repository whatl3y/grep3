import minimist from "minimist";
import { Queue } from "node-resque";
import redis from "../../redis";
import config from "../../config";

const argv = minimist(process.argv.slice(2));
const queueName = argv.q || argv.queue || config.resque.default;
const start = argv.s || argv.start || 0;
const end = argv.e || argv.end || 10;

(async function getQueuedJobs() {
  const queue = new Queue({
    connection: { redis },
  });
  await queue.connect();

  const jobs = await queue.queued(queueName, start, end);
  jobs.forEach((job: any) => console.log(JSON.stringify(job)));

  await queue.end();
  process.exit();
})();
