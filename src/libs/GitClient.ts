// import fs from "fs";
import path from "path";
import SimpleGitFactory, { SimpleGit } from "simple-git";
import config from "../config";

export default function GitClient(
  address: string,
  repoName: string,
  workingDir: string,
  mainBranch: string = "main"
) {
  const getProtocol: RegExp = /^(https?:\/\/)(.*)/;
  const protocol: string = config.server.host.replace(getProtocol, "$1");
  const hostOnly: string = config.server.host.replace(getProtocol, "$2");
  const hostWithAuth: string = `${protocol}web3-compute:TMP@${hostOnly}`;

  const gitClient: SimpleGit = SimpleGitFactory({ baseDir: workingDir });

  return {
    gitClient,
    repoName,
    address,
    workingDir,

    // async getTrackedFiles(): Promise<string[]> {
    //   // returns newline-delimited file paths
    //   const paths = await gitClient.raw([
    //     "ls-tree",
    //     "-r",
    //     mainBranch,
    //     "--name-only",
    //   ]);
    //   return paths.split("\n").filter((f) => !!f);
    // },

    // async initAndPushLocalRepo(commitMessage: string = "init"): Promise<void> {
    //   await gitClient.init();
    //   await gitClient.add("./*");
    //   await gitClient.commit(commitMessage);
    //   if (!(await this.hasLocalRemote())) {
    //     await gitClient.addRemote(
    //       "origin",
    //       `${hostWithAuth}/git/${address}/${repoName}`
    //     );
    //   }
    //   await gitClient.raw(["push", "-u", "origin", mainBranch]);
    // },

    async hasLocalRemote(): Promise<boolean> {
      const remotes = await gitClient.getRemotes(true);
      return !!remotes.find((r) => r.name === "origin");
    },

    async cloneRepo(): Promise<void> {
      await gitClient.clone(`${hostWithAuth}/git/${address}/${repoName}`);
    },

    async pullRepo(): Promise<void> {
      await gitClient.init();
      if (!(await this.hasLocalRemote())) {
        await gitClient.addRemote(
          "origin",
          `${hostWithAuth}/git/${address}/${repoName}`
        );
      }
      await gitClient.pull("origin", mainBranch);
    },

    // async overrideFileAndPush(
    //   filePathInRepo: string,
    //   fileDataReadStream: fs.ReadStream,
    //   commitMessage: string = `chest.store - update file version ${filePathInRepo}`
    // ): Promise<void> {
    //   await this.overrideFile(filePathInRepo, fileDataReadStream);
    //   await this.initAndPushLocalRepo(commitMessage);
    // },

    // async overrideFile(
    //   filePathInRepo: string,
    //   fileDataReadStream: fs.ReadStream
    // ): Promise<void> {
    //   return await new Promise(
    //     (resolve: (data: any) => void, reject: (err: any) => void) => {
    //       const writeStream: fs.WriteStream = fs.createWriteStream(
    //         path.join(workingDir, filePathInRepo)
    //       );
    //       fileDataReadStream
    //         .on("error", reject)
    //         .on("end", () => resolve(null))
    //         .pipe(writeStream);
    //     }
    //   );
    // },
  };
}
