import minimist from "minimist";
import { Queue } from "node-resque";
import redis from "../../redis";

const argv = minimist(process.argv.slice(2));
const queueName = argv.q || argv.queue || null;

(async () => {
  const queue = new Queue({ connection: { redis } });
  await queue.connect();

  let queueInfo = [];
  if (queueName) {
    queueInfo.push({ name: queueName, length: await queue.length(queueName) });
  } else {
    const queues = await queue.queues();
    queueInfo = await Promise.all(
      queues.map(async (queueName) => ({
        name: queueName,
        length: await queue.length(queueName),
      }))
    );
  }

  queueInfo.forEach((obj) =>
    console.log(
      `BackgroundWorkerQueue ${obj.name} length is currently: ${obj.length}`
    )
  );
  await queue.end();
  process.exit();
})();
