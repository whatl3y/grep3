import path from "path";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { Readable } from "stream";
import { pack } from "tar-fs";
import { IExecutor } from ".";
import { IFactoryOptions } from "../factory";
import FileManagement from "../libs/FileManagement";
import GitClient from "../libs/GitClient";
import docker from "../libs/Docker";

export default function DockerExecutor({ log }: IFactoryOptions): IExecutor {
  const fileMgmt = FileManagement();
  return {
    async run(addressDirectoryRoot, repoAddress, repoName, envVars) {
      const repoExecutionFilePath = path.join(
        addressDirectoryRoot,
        repoName.replace(/\.git$/, "")
      );
      const repoExecutionTarballPath = path.join(
        addressDirectoryRoot,
        `${repoName}.tgz`
      );

      if (!(await fileMgmt.doesDirOrFileExist(repoExecutionFilePath))) {
        await mkdir(repoExecutionFilePath, { recursive: true });
        const gitClient = GitClient(
          repoAddress,
          repoName,
          repoExecutionFilePath
        );
        await gitClient.pullRepo();
        log.debug(`successfully pulled to repo`, repoExecutionFilePath);
        const repoTarStream = createWriteStream(repoExecutionTarballPath);
        pack(repoExecutionFilePath).pipe(repoTarStream);

        await new Promise((resolve, reject) => {
          repoTarStream.on("finish", () => resolve(null));
          repoTarStream.on("error", (err: any) => reject(err));
        });
        log.debug(
          `successfully created repo tarball for docker`,
          repoExecutionTarballPath
        );
      }

      const buildStream = await docker.buildImage(repoExecutionTarballPath);
      const image: any = await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          buildStream,
          (err: null | Error, res: any[]) => (err ? reject(err) : resolve(res))
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
        Env:
          envVars &&
          Object.keys(envVars).map((key) => `${key}=${envVars[key]}`),
        OpenStdin: false,
        StdinOnce: false,
      });
      const containerHash = container.id;
      log.debug(`successfully created container`, imgHash, containerHash);

      await container.start();
      const containerStream: unknown = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      // wait for container to finish and collect output
      await container.wait();
      log.debug(`container finished executing`, containerHash);

      return containerStream as Readable;
    },
  };
}
