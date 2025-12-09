import dotenv from "dotenv";
import { existsSync, mkdirSync } from "fs";
import { Git } from "node-git-server";
import express from "express";
import path from "path";
import { URL } from "url";
import { getAddress, isAddress } from "ethers";
import log from "./logger";
import redis from "./redis";
import config from "./config";
import { db } from "./database/database";
import { IFactoryOptions } from "./factory";
import GitServer, { defaultRootDir, untarRepoFromAws } from "./libs/GitServer";

dotenv.config({ quiet: true });

(async function web3Compute() {
  try {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);

    const injectArgs: IFactoryOptions = { db, log, redis };

    // git servers per username
    const gitServer = GitServer(injectArgs);
    let userGitServers: { [username: string]: Git } = {};
    app.use("/git/:username", async function gitRoute(req, res) {
      try {
        if (!isAddress(req.params.username)) {
          throw new Error("invalid address");
        }
        const username = getAddress(req.params.username);

        // fetch repo(s) from AWS S3 tarballs to support ephemeral file storage
        if (req.method == "GET") {
          const url = new URL(
            req.originalUrl,
            `${req.protocol}://${req.get("host")}`
          );
          const m = url.pathname.match(/^\/.*\/(.+)\/info\/refs$/);
          if (m) {
            const repo = m[1];
            if (repo) {
              const cwd = path.join(gitServer.rootDir, username);
              if (!existsSync(cwd)) {
                mkdirSync(cwd, { recursive: true });
              }
              const repoFilepath = path.join(cwd, repo);
              if (!existsSync(repoFilepath)) {
                const success = await untarRepoFromAws(
                  log,
                  gitServer.rootDir,
                  username,
                  repo
                );
                if (!success) {
                  log.info("fetch: repo not found", username, repo);
                  return res.status(404).send("repo not found");
                }
              }
            }
          }
        }

        userGitServers[username] =
          userGitServers[username] || (await gitServer.create(username));
        userGitServers[username].handle(req, res); // connect style request handling
      } catch (err: any) {
        log.error(`git handle error`, err);
        res.status(500).send(err.message);
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
