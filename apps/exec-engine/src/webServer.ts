import dotenv from "dotenv";
import express from "express";
import path from "path";
import { getAddress, isAddress } from "ethers";
import { mkdir, readFile } from "fs/promises";
import { Git } from "node-git-server";
import {
  GitServer,
  untarRepoFromAws,
  defaultRootDir,
  FileManagement,
  db,
  IFactoryOptions,
} from "@grep3/core";
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

    // git servers per username
    const gitServer = GitServer(injectArgs);
    let userGitServers: { [username: string]: Git } = {};
    app.use("/:username", async (req, res) => {
      try {
        if (!isAddress(req.params.username)) {
          throw new Error("invalid address");
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

              const cwd = path.join(defaultRootDir, username);
              if (!(await fileMgmt.doesDirOrFileExist(cwd))) {
                await mkdir(cwd, { recursive: true });
              }
              const repoFilepath = path.join(cwd, repo);
              const repoExistsLocally = await fileMgmt.doesDirOrFileExist(
                repoFilepath
              );

              if (!repoExistsLocally) {
                // Try to pull repo from S3
                const success = await untarRepoFromAws(
                  log,
                  defaultRootDir,
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
      } catch (err: any) {
        log.error(`outer git/username error`, err);
        res.status(500).send(err.message);
      }
    });

    // present setup guide on home page
    app.get("/", async (_, res) => {
      try {
        const html = await readFile(
          path.join(__dirname, "templates", "index.html"),
          "utf-8"
        );
        res.type("html").send(html);
      } catch (err: any) {
        res.status(500).send(err.stack);
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
