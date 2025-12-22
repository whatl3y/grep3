import path from "path";
import { mkdir } from "fs/promises";
import {
  Repo,
  Aws,
  FileManagement,
  getExecutor,
  streamToBuffer,
  untarRepoFromAws,
  updateExecution,
  IFactoryOptions,
} from "@grep3/core";
// import config from "../config";

const aws = Aws();
const fileMgmt = FileManagement();

const gitRepoFilePath = path.join(__dirname, "..", "..", "tmp", "git");
const executionFilePath = path.join(__dirname, "..", "..", "tmp", "executions");

export default function DockerWorkers({ log, db, redis }: IFactoryOptions) {
  return {
    dockerExecute: {
      plugins: ["Retry"],
      pluginOptions: {
        retry: {
          retryLimit: 5,
          retryDelay: 1000 * 5,
        },
      },
      perform: async ({
        executionId,
        repo,
      }: {
        executionId: number;
        repo: Repo;
      }) => {
        // let imgHash: string | undefined;
        // let containerHash: string | undefined;

        try {
          // create directory path to address namespace if needed
          const addressRepoFilepath = path.join(
            gitRepoFilePath,
            repo?.address as string
          );
          if (!(await fileMgmt.doesDirOrFileExist(addressRepoFilepath))) {
            await mkdir(addressRepoFilepath, { recursive: true });
          }
          log.debug(`successfully made repo file path`, addressRepoFilepath);

          const addressExecutionFilepath = path.join(
            executionFilePath,
            repo?.address as string
          );
          if (!(await fileMgmt.doesDirOrFileExist(addressExecutionFilepath))) {
            await mkdir(addressExecutionFilepath, { recursive: true });
          }
          log.debug(`successfully made execution file path`, executionFilePath);

          // pull repo to file system to pass to build docker image
          const repoGitFilePath = path.join(addressRepoFilepath, repo?.name);
          if (!(await fileMgmt.doesDirOrFileExist(repoGitFilePath))) {
            await untarRepoFromAws(
              log,
              gitRepoFilePath,
              repo?.address,
              repo?.name
            );
          }
          log.debug("successfully added git repo", repo?.address, repo?.name);

          const outputStream = await getExecutor({ log, db, redis }).run(
            addressExecutionFilepath,
            repo?.address,
            repo?.name
          );

          // convert stream to buffer before uploading to S3
          const outputBuffer = await streamToBuffer(outputStream);
          log.debug(
            `successfully collected container output (${outputBuffer.length} bytes)`
          );

          // upload collected output to AWS S3
          const outputFileName = `executions/stdout_${executionId}.log`;
          const { filename: outputFilePath } = await aws.writeFile({
            filename: outputFileName,
            data: outputBuffer,
          });
          log.debug(
            `successfully uploaded container output to S3`,
            outputFilePath
          );

          await updateExecution(executionId, {
            stdout_file: outputFilePath,
          });
          log.debug(
            `successfully finished executing and updating DB`,
            outputFilePath
          );
        } catch (err: any) {
          log.error(
            `error executing docker container for execution ${executionId}`,
            err
          );

          // upload error stack to AWS S3
          const errorFileName = `executions/error_${executionId}.log`;
          const errorStack = err?.stack || err?.message || String(err);
          const { filename: errorFilePath } = await aws.writeFile({
            filename: errorFileName,
            data: errorStack,
            exactFilename: true,
          });
          log.debug(`successfully uploaded error stack to S3`, errorFilePath);

          // update execution in DB with image_hash, container_hash, and error file
          const updateData: any = {
            stdout_file: errorFilePath,
          };

          await updateExecution(executionId, updateData);
          log.debug(
            `successfully updated execution in DB with error information`,
            executionId,
            errorFilePath
          );

          // NOTE: don't rethrow for now, assume we try once and don't try again afterwards
          // re-throw the error to mark the job as failed in the queue
          // throw err;
        }
      },
    },
  };
}
