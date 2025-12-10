// import assert from "assert";
import { getAddress, isAddress } from "ethers";
import { Request, Response } from "express";
import { IRoute } from "./index";
import { findRepoById, findRepos } from "../database/models/repos";
import log from "../logger";
import redis from "../redis";
import { createExecution } from "../database/models/executions";
import BackgroundWorker from "../libs/BackgroundWorker";

export const repos: IRoute = {
  method: "get",
  path: "/repos/:address",
  async handler(req: Request, res: Response) {
    try {
      const address = req.params.address;
      if (!isAddress(address)) {
        return res.status(400).send(`invalid address provided: ${address}`);
      }
      const repos = await findRepos({ address: getAddress(address) });
      log.debug(`repos found`, address, repos);
      res.json({ repos });
    } catch (err: any) {
      res.status(err.statusCode || 500).send(err.stack);
    }
  },
};

export const repoExecute: IRoute = {
  method: "all",
  path: "/repos/execute/:id",
  async handler(req: Request, res: Response) {
    try {
      const id = req.params.id;
      if (isNaN(Number(id))) {
        return res.status(400).send(`invalid id: ${id}`);
      }

      const repo = await findRepoById(Number(id));
      if (!repo) {
        return res.status(404).send(`no repo found with id: ${id}`);
      }
      log.debug(`found repo`, repo);

      const execution = await createExecution({ repo_id: repo.id });
      await BackgroundWorker(redis).enqueue("dockerExecute", {
        executionId: execution.id,
        repo,
      });
      log.debug(`queued up job for execution`, execution.id);

      res.json({ execution });
    } catch (err: any) {
      res.status(err.statusCode || 500).send(err.stack);
    }
  },
};
