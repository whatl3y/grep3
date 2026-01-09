import dotenv from "dotenv";
import express from "express";
import path from "path";
import { getAddress, isAddress } from "ethers";
import { mkdir } from "fs/promises";
import { Git } from "node-git-server";
import {
  GitServer,
  untarRepoFromAws,
  FileManagement,
  db,
  IFactoryOptions,
} from "@grep3/core";
import bindRoutes from "./routes";
import RecentPushes from "./libs/RecentPushes";
import redis from "./redis";
import config from "./config";
import log from "./logger";

dotenv.config({ quiet: true });

(async function webServer() {
  try {
    const fileMgmt = FileManagement();
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);

    const injectArgs: IFactoryOptions = { db, log, redis };
    const recentPushes = RecentPushes(redis);

    // Bind all routes from the routes directory
    bindRoutes(app);

    // git servers per username (username must be a valid Ethereum address)
    const gitServer = GitServer(injectArgs, {
      rootDir: config.gitRootDir,
      onPush: async (event) => {
        await recentPushes.addPush(event);
      },
    });
    const userGitServers: { [username: string]: Git } = {};
    app.use("/:username", async (req, res, next) => {
      try {
        // Only handle requests where username is a valid Ethereum address
        // Otherwise, pass to other routes
        if (!isAddress(req.params.username)) {
          return next();
        }
        const username = getAddress(req.params.username);
        userGitServers[username] =
          userGitServers[username] || (await gitServer.create(username));
        // fetch repo(s) from AWS S3 tarballs to support ephemeral file storage
        if (req.method == "GET") {
          const url = new URL(
            req.originalUrl,
            `${req.protocol}://${req.get("host")}`
          );
          const m = url.pathname.match(/^\/.*\/(.+)\/info\/refs$/);
          if (m) {
            const repo = /\.git$/.test(m[1]) ? m[1] : `${m[1]}.git`;
            if (repo) {
              const service = url.searchParams.get("service");
              const isGitFetch = service === "git-upload-pack"; // git fetch, pull, clone
              const isGitPush = service === "git-receive-pack"; // git push

              const cwd = path.join(config.gitRootDir, username);
              if (!(await fileMgmt.doesDirOrFileExist(cwd))) {
                await mkdir(cwd, { recursive: true });
              }
              const repoFilepath = path.join(cwd, repo);
              let repoExistsLocally = await fileMgmt.doesDirOrFileExist(
                repoFilepath
              );

              // Check if the repo directory exists but is empty/incomplete (ephemeral filesystem issue)
              if (repoExistsLocally) {
                try {
                  const repoContents = await fileMgmt.readDir(repoFilepath);
                  // A valid bare git repo should have at least HEAD, objects, refs
                  const hasRequiredFiles =
                    repoContents.includes("HEAD") &&
                    repoContents.includes("objects") &&
                    repoContents.includes("refs");
                  if (!hasRequiredFiles) {
                    log.info(
                      "Bare repo exists but appears incomplete, will re-fetch from AWS",
                      username,
                      repo
                    );
                    repoExistsLocally = false;
                  }
                } catch {
                  // If we can't read the directory, treat as non-existent
                  repoExistsLocally = false;
                }
              }

              if (!repoExistsLocally) {
                // Try to pull repo from S3
                const success = await untarRepoFromAws(
                  log,
                  config.gitRootDir,
                  username,
                  repo
                );

                // For git fetch/pull/clone: return 404 if repo not found in S3
                if (isGitFetch && !success) {
                  log.info("fetch: repo not found in S3", username, repo);
                  return res.status(404).send("repo not found");
                }

                // For git push: if repo exists in S3, we pulled it above
                // If repo does NOT exist in S3, allow the push to proceed
                // (it will be created locally and then pushed to S3)
                if (isGitPush && success) {
                  log.info(
                    "push: pulled existing repo from S3",
                    username,
                    repo
                  );
                } else if (isGitPush && !success) {
                  log.info(
                    "push: repo not in S3, allowing new push",
                    username,
                    repo
                  );
                }
              }
            }
          }
        }

        userGitServers[username].handle(req, res); // connect style request handling
      } catch (err: unknown) {
        log.error(`outer git/username error`, err);
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).send(message);
      }
    });

    app.listen(config.server.port, () =>
      log.info(`listening on *:${config.server.port}`)
    );
  } catch (err) {
    console.error(err);
    process.exit();
  }
})();
