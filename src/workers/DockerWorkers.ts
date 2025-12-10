import path from "path";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { Readable } from "stream";
import { pack } from "tar-fs";
import { IFactoryOptions } from "../factory";
import { Repo } from "../database/types";
import Aws from "../libs/Aws";
import FileManagement from "../libs/FileManagement";
import docker, { InMemoryWritableStream, streamToBuffer } from "../libs/Docker";
import { untarRepoFromAws } from "../libs/GitServer";
import GitClient from "../libs/GitClient";
import { updateExecution } from "../database/models/executions";
// import config from '../config'

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

        const repoExecutionFilePath = path.join(
          addressExecutionFilepath,
          repo?.name.replace(/\.git$/, "")
        );
        const repoExecutionTarball = path.join(
          addressExecutionFilepath,
          `${repo?.name}.tgz`
        );
        if (!(await fileMgmt.doesDirOrFileExist(repoExecutionFilePath))) {
          await mkdir(repoExecutionFilePath, { recursive: true });
          const gitClient = GitClient(
            repo?.address,
            repo?.name,
            repoExecutionFilePath
          );
          // await gitClient.cloneRepo();
          await gitClient.pullRepo();
          log.debug(`successfully pulled to repo`, repoExecutionFilePath);
          const repoTarStream = createWriteStream(repoExecutionTarball);
          pack(repoExecutionFilePath).pipe(repoTarStream);

          await new Promise((resolve, reject) => {
            repoTarStream.on("finish", () => resolve(null));
            repoTarStream.on("error", (err) => reject(err));
          });
          log.debug(
            `successfully created repo tarball for docker`,
            repoExecutionTarball
          );
        }

        const outputStream = new InMemoryWritableStream();
        const buildStream = await docker.buildImage(repoExecutionTarball);
        buildStream.pipe(outputStream);
        const image: any = await new Promise((resolve, reject) => {
          docker.modem.followProgress(
            buildStream,
            (err: null | Error, res: any[]) =>
              err ? reject(err) : resolve(res)
          );
        });

        const imgHash = image.find((p: any) => Object.keys(p)[0] === "aux").aux
          .ID;
        log.debug(`successfully created image`, imgHash);

        const container = await docker.createContainer({
          Image: imgHash,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Env: [], // TODO
          OpenStdin: false,
          StdinOnce: false,
        });
        const containerHash = container.id;
        log.debug(`successfully created container`, containerHash);

        await container.start();
        const containerStream: unknown = await container.attach({
          stream: true,
          stdout: true,
          stderr: true,
        });
        const buffer = await streamToBuffer(containerStream as Readable);
        const output = buffer.toString("utf8");

        await updateExecution(executionId, {
          image_hash: imgHash,
          container_hash: containerHash,
          output: output,
        });
        log.debug(
          `successfully finished executing and updating DB`,
          containerHash,
          output
        );
      },
    },
  };
}
