import minimist from "minimist";
import { Queue } from "@grep3/core";
import redis from "../../redis";

const argv = minimist(process.argv.slice(2));
const countOnly = argv.c || argv.count;
const onlyRemove = argv.d || argv.delete || argv.r || argv.remove;
const jobClass = argv.class;

(async () => {
  const queue = new Queue({
    connection: { redis },
  });
  await queue.connect();

  const failedCount = await queue.failedCount();

  if (countOnly) {
    console.log(`Currently ${failedCount} failed jobs.`);
  } else {
    const numJobs = Math.min(2500, failedCount);
    const failedJobs = await queue.failed(0, numJobs);
    let method: "retryAndRemoveFailed" | "removeFailed" =
      "retryAndRemoveFailed";
    let verb: string = "Retried";
    if (onlyRemove) {
      method = "removeFailed";
      verb = "Deleted";
    }

    let jobsProcessed = 0;
    await Promise.all(
      failedJobs.map(async (job: any) => {
        if (jobClass) {
          if (job.payload.class !== jobClass) return;
        }

        await queue[method](job);
        jobsProcessed++;
      })
    );

    console.log(
      `${verb} ${jobsProcessed} failed jobs (${numJobs} failed total).`
    );
  }

  await queue.end();
  process.exit();
})();
