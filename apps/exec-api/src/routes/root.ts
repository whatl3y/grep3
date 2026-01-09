import { Request, Response } from "express";
import { getAddress } from "ethers";
import {
  findExecutionsByRepoId,
  Aws,
  findRepoByAddressAndName,
} from "@grep3/core";
import { IRoute } from "./index";
import log from "../logger";

const aws = Aws();

export const repos: IRoute = {
  method: "get",
  path: "/:address/:repoName",
  async handler(req: Request, res: Response) {
    try {
      const address = getAddress(req.params.address);
      let repoName = req.params.repoName;

      // Handle .git suffix - add it if not present
      if (!repoName.endsWith(".git")) {
        repoName = `${repoName}.git`;
      }

      // Find the repo by name
      const repo = await findRepoByAddressAndName(address, repoName);
      if (!repo) {
        return res.status(404).send(`repository not found: ${repoName}`);
      }

      log.debug(`Found repo:`, repo);

      // Find executions for this repo
      const executions = await findExecutionsByRepoId(repo.id);
      if (!executions || executions.length === 0) {
        return res
          .status(404)
          .send(`no executions for repository: ${repoName}`);
      }

      // Get the latest execution (sort by created_at descending)
      const latestExecution = executions.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      log.debug(`Latest execution:`, latestExecution);

      if (!latestExecution.stdout_file) {
        return res
          .status(404)
          .send(
            `no stdout file found for latest execution of repository: ${repoName}`
          );
      }

      // stream stdout to the response
      await aws.getFileStreamWithBackoff(res, {
        filename: latestExecution.stdout_file,
      });
    } catch (err: any) {
      log.error("error in repo route:", err);
      res.status(err.statusCode || 500).json({ error: "Failed to get execution output" });
    }
  },
};
