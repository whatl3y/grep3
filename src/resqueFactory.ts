import { MultiWorker, Scheduler, ConnectionOptions, Jobs } from "node-resque";
import log from "./logger";

export default function startResqueServer({
  connection,
  jobs,
  queues,
}: {
  connection: ConnectionOptions;
  jobs?: Jobs;
  queues?: string[];
}) {
  return {
    async worker() {
      if (!jobs) throw new Error(`no jobs...`);

      const multiWorker = new MultiWorker(
        {
          connection: connection,
          queues: queues,
          minTaskProcessors: 1,
          maxTaskProcessors: 1,
          checkTimeout: 1000,
          maxEventLoopDelay: 10,
        },
        jobs
      );

      multiWorker.start();

      multiWorker.on("start", (workerId) =>
        log.debug(`worker[${workerId}] started`)
      );
      multiWorker.on("end", (workerId) =>
        log.debug(`worker[${workerId}] ended`)
      );
      multiWorker.on("cleaning_worker", (workerId, worker, pid) =>
        log.debug(`cleaning old worker ${worker} (${workerId} -- ${pid})`)
      );
      multiWorker.on("poll", (workerId, queue) =>
        log.trace(`worker[${workerId}] polling ${queue}`)
      );
      multiWorker.on("ping", (workerId, time) =>
        log.trace(`worker[${workerId}] check in @ ${time}`)
      );
      multiWorker.on("job", (workerId, queue, job) =>
        log.info(`worker[${workerId}] working job ${queue} ${printObject(job)}`)
      );
      multiWorker.on("reEnqueue", (workerId, queue, job, plugin) =>
        log.info(
          `worker[${workerId}] reEnqueue job (${printObject(
            plugin
          )}) ${queue} ${printObject(job)}`
        )
      );
      multiWorker.on("success", (workerId, queue, job, result) =>
        log.info(
          `worker[${workerId}] job success ${queue} ${printObject(
            job
          )} >> ${printObject(result)}`
        )
      );
      multiWorker.on("failure", (workerId, queue, job, failure) =>
        log.error(
          `worker[${workerId}] job failure ${queue} ${printObject(
            job
          )} >> ${printObject(failure)}`
        )
      );
      multiWorker.on("error", (workerId, queue, job, error) =>
        log.error(
          `worker[${workerId}] error ${queue} ${printObject(
            job
          )} >> ${printObject(error)}`
        )
      );
      multiWorker.on("pause", (workerId) =>
        log.debug(`worker[${workerId}] paused`)
      );
      // multiWorker.on("internalError", (error) => log.error(printObject(error)));
      multiWorker.on("multiWorkerAction", (verb, delay) =>
        log.trace(
          `*** checked for worker status: ${verb} (event loop delay: ${delay} ms)`
        )
      );

      return multiWorker;
    },

    async scheduler() {
      const scheduler = new Scheduler({
        connection: connection,
      });
      await scheduler.connect();
      scheduler.start();

      scheduler.on("start", () => log.debug(`scheduler started`));
      scheduler.on("end", () => log.info(`scheduler ended`));
      scheduler.on("poll", () => log.debug(`scheduler polling`));
      scheduler.on("leader", () => log.info(`scheduler became leader`));
      scheduler.on("error", (error) =>
        log.error(`scheduler error >> ${printObject(error)}`)
      );
      scheduler.on("cleanStuckWorker", (workerName, errorPayload, delta) =>
        log.info(
          `failing ${workerName} (stuck for ${delta}s) and failing job ${printObject(
            errorPayload
          )}`
        )
      );
      scheduler.on("workingTimestamp", (timestamp) =>
        log.info(`scheduler working timestamp ${timestamp}`)
      );
      scheduler.on("transferredJob", (timestamp, job) =>
        log.info(`scheduler enquing job ${timestamp} >> ${printObject(job)}`)
      );

      return scheduler;
    },
  };
}

export function printObject(obj: any): string {
  if (!obj) return "N/A";

  if (obj instanceof Error) return obj.stack || obj.message;

  if ({}.toString.call(obj) == "[object Object]") return JSON.stringify(obj);

  return obj.toString();
}
