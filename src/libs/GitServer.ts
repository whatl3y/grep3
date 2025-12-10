import bunyan from "bunyan";
import { createReadStream } from "fs";
import path from "path";
import { c as tarCreate, x as tarExtract } from "tar";
import { Git, FetchData, PushData } from "node-git-server";
import Aws from "./Aws";
import {
  createRepo,
  findRepoByAddressAndName,
  updateRepo,
} from "../database/models/repos";
import { IFactoryOptions } from "../factory";

const aws = Aws();

export interface IGitServer {
  rootDir: string;
  create(address: string): Promise<Git>;
}

export const defaultRootDir = path.join(__dirname, "..", "..", "tmp", "git");

export default function GitServer(
  { log }: IFactoryOptions,
  rootDir: string = defaultRootDir
): IGitServer {
  return {
    rootDir,

    async create(address: string): Promise<Git> {
      const filePath = path.join(rootDir, address);
      const repos = new Git(filePath, {
        autoCreate: true,
        // authenticate: ({ type, user /*, repo, headers */ }, next) =>
        //   // NOTE: don't need to auth as address/username is in route of
        //   // endpoint the user is pushing to and does not need to be hidden
        //   type == "push"
        //     ? user((address /*, password */) => {
        //         if (!isAddress(address)) {
        //           return next(new Error(`address must be valid EVM address`));
        //         }
        //         next();
        //       })
        //     : next(),
      });

      // handle git pushes
      repos.on("push", function onPush(push: PushData) {
        push.accept();
        push.res.on("finish", async (): Promise<void> => {
          try {
            log.debug(
              `push success ${push.repo}:${push.branch}:${push.commit}`
            );
            const { name: tarballName, fullFilePath } = await tarRepo(
              rootDir,
              address,
              push.repo
            );

            // send tarball repo to AWS
            const { filename: internalFilename } = await aws.writeFile({
              filename: `${address}/${tarballName}`,
              data: createReadStream(fullFilePath),
            });
            const existingRepo = await findRepoByAddressAndName(
              address,
              push.repo
            );

            // write to DB
            if (existingRepo) {
              await updateRepo(existingRepo.id, {
                internal_name: internalFilename,
              });
            } else {
              await createRepo({
                address: address,
                internal_name: internalFilename,
                name: push.repo,
              });
            }
          } catch (err) {
            log.error(`push error0`, err);
          }
        });
        push.res.on("error", (err) => {
          log.error(`push error1`, err);
        });
      });

      // handle git fetch, clone, etc.
      repos.on("fetch", async function onFetch(fetch: FetchData) {
        try {
          fetch.accept();
          fetch.res.on("finish", () => {
            log.debug(`fetch complete ${fetch.commit}`);
          });
          fetch.res.on("error", (err) => {
            log.error(`fetch error0`, err);
          });
        } catch (err: any) {
          log.error(`fetch error1`, err);
          fetch.reject(500, err.message);
        }
      });

      return repos;
    },
  };

  // internal functions

  async function tarRepo(
    rootDir: string,
    address: string,
    repoName: string
  ): Promise<{ dir: string; name: string; fullFilePath: string }> {
    repoName = repoName.replace(/\.git$/, "");
    const repoTarFilename = `${repoName}.git.tgz`;
    const filePath = path.join(rootDir, address);
    const fullRepoTarPath = path.join(filePath, repoTarFilename);

    await tarCreate(
      {
        onwarn: (code: number | string, message: string, data: any) =>
          log.error(`Error with tar.c`, code, message, data),
        gzip: true,
        strict: true,
        file: fullRepoTarPath,
        cwd: filePath,
      },
      [`${repoName}.git`]
    );

    return {
      dir: filePath,
      name: repoTarFilename,
      fullFilePath: fullRepoTarPath,
    };
  }
}

export async function untarRepoFromAws(
  log: bunyan,
  rootDir: string,
  address: string,
  repoName: string
): Promise<boolean> {
  const userGitDir = path.join(rootDir, address);

  const repo = await findRepoByAddressAndName(address, repoName);
  if (!repo) return false;
  log.debug(`repo found`, repo);

  await aws.getFileStreamWithBackoff(
    tarExtract({
      onwarn: (code: number | string, message: string, data: any) =>
        log.error(`Error with tar.x`, code, message, data),
      strict: true,
      cwd: userGitDir,
    }),
    { filename: repo.internal_name }
  );
  log.debug(`successfully extracted tarball from AWS`, repo.internal_name);
  return true;
}
