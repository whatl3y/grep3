import IORedis from "ioredis";
import { Queue } from "node-resque";
import config from "../config";

export default function BackgroundWorker(redis: IORedis) {
  if (!redis) throw new Error(`no redis client`);

  const queue = new Queue({ connection: { redis } });

  return {
    queue,
    isConnected: false,

    async enqueue(job: string, options = {}, queue = config.resque.default) {
      await this.connect();
      await this.queue.enqueue(queue, job, [options]);
    },

    async enqueueIn(
      milliseconds: number,
      job: string,
      options = {},
      queue = config.resque.default
    ) {
      await this.connect();
      await this.queue.enqueueIn(milliseconds, queue, job, [options]);
    },

    async connect() {
      if (this.isConnected) return;

      await this.queue.connect();
      this.isConnected = true;
    },
  };
}
