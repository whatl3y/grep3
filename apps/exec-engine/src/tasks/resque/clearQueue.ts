import minimist from "minimist";
import { Queue } from "node-resque";
import redis from "../../redis";

const argv = minimist(process.argv.slice(2));
const queueToClear = argv.q || argv.queue;

(async function clearQueue() {
  if (!queueToClear) {
    console.error(`No queue (-q or --queue) specified to delete.`);
    return process.exit();
  }

  const queue = new Queue({
    connection: { redis },
  });
  await queue.connect();
  await queue.delQueue(queueToClear);
  await queue.end();

  console.log(`Successfully cleared queue: ${queueToClear}`);
  process.exit();
})();
