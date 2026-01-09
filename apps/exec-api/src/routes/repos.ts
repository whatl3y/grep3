// import assert from "assert";
import { getAddress, isAddress } from "ethers";
import { Request, Response } from "express";
import {
  findRepoById,
  findRepos,
  createExecution,
  BackgroundWorker,
} from "@grep3/core";
import { IRoute } from "./index";
import log from "../logger";
import redis from "../redis";

export const repos: IRoute = {
  method: "get",
  path: "/repos/:address/all",
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
      log.error("Error listing repos:", err);
      res.status(err.statusCode || 500).json({ error: "Failed to list repos" });
    }
  },
};

export const repoGet: IRoute = {
  method: "get",
  path: "/repos/:id/get",
  async handler(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).send(`invalid id: ${id}`);
      }

      const repo = await findRepoById(id);
      log.debug(`repo found`, repo);
      res.json({ repo });
    } catch (err: any) {
      log.error("Error getting repo:", err);
      res.status(err.statusCode || 500).json({ error: "Failed to get repo" });
    }
  },
};

export const repoExecute: IRoute = {
  method: "all",
  path: "/repos/:id/execute",
  async handler(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
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
      log.error("Error executing repo:", err);
      res.status(err.statusCode || 500).json({ error: "Failed to execute repo" });
    }
  },
};
