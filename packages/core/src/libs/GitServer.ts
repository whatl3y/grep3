import bunyan from "bunyan";
import { createReadStream } from "fs";
import { rm } from "fs/promises";
import path from "path";
import { c as tarCreate, x as tarExtract } from "tar";
import { Git, FetchData, PushData, GitAuthenticateOptions } from "node-git-server";
import Aws from "./Aws";
import {
  createRepo,
  findRepoByAddressAndName,
  updateRepo,
} from "../database/models/repos";
import {
  findAddressByAddress,
  findOrCreateAddress,
} from "../database/models/addresses";
import { IFactoryOptions } from "../factory";
import { verifySignature, parseAuthCredential } from "./SignatureAuth";

const aws = Aws();

export interface PushEvent {
  address: string;
  repo: string;
  branch: string;
  commit: string;
}

export interface GitServerOptions {
  rootDir?: string;
  onPush?: (event: PushEvent) => Promise<void> | void;
}

export interface IGitServer {
  rootDir: string;
  create(address: string): Promise<Git>;
}

export const defaultRootDir = path.join(__dirname, "..", "..", "tmp", "git");

export default function GitServer(
  { log }: IFactoryOptions,
  options: GitServerOptions = {}
): IGitServer {
  const rootDir = options.rootDir ?? defaultRootDir;
  const onPushCallback = options.onPush;

  return {
    rootDir,

    async create(address: string): Promise<Git> {
      const filePath = path.join(rootDir, address);
      const repos = new Git(filePath, {
        autoCreate: true,
        // Note: node-git-server handles async authenticate functions by calling
        // promise.then(next).catch(next), so we should NOT call next() manually.
        // Just return for success, or throw an error for rejection.
        authenticate: async ({ type, repo, user }: GitAuthenticateOptions) => {
          // Only authenticate pushes, allow fetches without auth
          if (type !== "push") {
            return;
          }

          // Check if address has any existing repos - if not, allow the push (first claim)
          const existingAddress = await findAddressByAddress(address);

          if (!existingAddress) {
            // New address - anyone can claim it with first push
            log.debug(
              `New address ${address}, allowing unauthenticated push`
            );
            return;
          }

          // Existing address - require signature authentication
          // Get both username and password - credential can be in either field
          const [username, password] = await user();

          // Try to parse credential from password first, then username
          // This allows users to put the credential in either field
          let parsed = password ? parseAuthCredential(password) : null;
          if (!parsed && username) {
            parsed = parseAuthCredential(username);
          }

          if (!parsed) {
            log.warn(
              `Push to ${address} rejected: no valid credentials provided`
            );
            throw new Error(
              "Authentication required. Use signature as username or password. " +
                "See /auth/docs for details."
            );
          }

          // Verify the signature against the address nonce (not repo-specific)
          const { signature } = parsed;
          const result = verifySignature(
            signature,
            address,
            existingAddress.auth_nonce
          );

          if (!result.valid) {
            log.warn(`Push to ${address} rejected: ${result.error}`);
            throw new Error(result.error || "Invalid signature");
          }

          // Signature is valid - can be reused for any repo under this address
          log.info(`Authenticated push to ${address}`);
        },
      });

      // handle git pushes
      repos.on("push", async function onPush(push: PushData) {
        // Normalize repo name to always end with .git
        const repoName = push.repo.endsWith(".git") ? push.repo : `${push.repo}.git`;

        // Clean up stale working directory for new repos
        // (used by /view route). Don't clean up bare repo - git server needs it for the push.
        const repoNameClean = repoName.replace(/\.git$/, "");
        const workingDirPath = path.join(filePath, `${repoNameClean}-working`);

        try {
          await rm(workingDirPath, { recursive: true, force: true });
          log.debug(`Cleaned up working dir: ${workingDirPath}`);
        } catch {
          // Ignore errors - directory may not exist
        }

        push.accept();
        push.res.on("finish", async (): Promise<void> => {
          try {
            log.debug(
              `push success ${repoName}:${push.branch}:${push.commit}`
            );
            const { name: tarballName, fullFilePath } = await tarRepo(
              rootDir,
              address,
              repoName
            );

            // send tarball repo to AWS
            const { filename: internalFilename } = await aws.writeFile({
              filename: `${address}/${tarballName}`,
              data: createReadStream(fullFilePath),
            });

            // Ensure address record exists (creates with random nonce if new)
            await findOrCreateAddress(address);

            // Re-check DB in case repo was created between push start and finish
            const repoInDb = await findRepoByAddressAndName(
              address,
              repoName
            );

            // write to DB
            if (repoInDb) {
              await updateRepo(repoInDb.id, {
                internal_name: internalFilename,
              });
            } else {
              await createRepo({
                address: address,
                internal_name: internalFilename,
                name: repoName,
              });
            }

            // Call optional push callback
            if (onPushCallback) {
              const pushEvent: PushEvent = {
                address,
                repo: repoName,
                branch: push.branch,
                commit: push.commit,
              };
              await onPushCallback(pushEvent);
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
  // Normalize repo name to always end with .git
  const normalizedRepoName = repoName.endsWith(".git") ? repoName : `${repoName}.git`;

  const repo = await findRepoByAddressAndName(address, normalizedRepoName);
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
