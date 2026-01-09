import minimist from "minimist";
import { Queue } from "node-resque";
import redis from "../../redis";

const argv = minimist(process.argv.slice(2));
const ageOfJob = parseInt(argv.a || argv.age || 0);

(async () => {
  const queue = new Queue({ connection: { redis } });
  await queue.connect();

  const results = await queue.cleanOldWorkers(ageOfJob);
  console.log(`clean workers results`, JSON.stringify(results));

  await queue.end();
  process.exit();
})();
