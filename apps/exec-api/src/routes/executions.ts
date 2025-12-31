import assert from "assert";
import { getAddress } from "ethers";
import { Request, Response } from "express";
import { Readable } from "stream";
import {
  findExecutions,
  findExecutionById,
  findRepoByAddressAndName,
  findRepoById,
  Aws,
} from "@grep3/core";
import { IRoute } from "./index";
import log from "../logger";

export const executions: IRoute = {
  method: "get",
  path: "/executions/:repoId/all",
  async handler(req: Request, res: Response) {
    const repoId = parseInt(req.params.repoId, 10);
    if (isNaN(repoId)) {
      return res.status(400).send(`invalid repo ID: ${req.params.repoId}`);
    }

    const repo = await findRepoById(repoId);
    assert(repo, "no repo by ID");
    assert(repo?.address, "no address for repo");
    assert(repo?.name, "no name for repo");

    const repoObject = await findRepoByAddressAndName(
      getAddress(repo?.address),
      repo?.name
    );
    if (!repoObject) {
      return res.status(404).send(`No repo`);
    }
    const executions = await findExecutions({ repo_id: repoObject.id });
    log.debug(`executions found`, repo.id, repo.address, repo.name);
    res.json({ executions });
  },
};

export const executionRecord: IRoute = {
  method: "get",
  path: "/executions/:id/get",
  async handler(req: Request, res: Response) {
    const executionId = parseInt(req.params.id, 10);
    if (isNaN(executionId)) {
      return res.status(400).send(`invalid execution ID: ${req.params.id}`);
    }

    const execution = await findExecutionById(executionId);
    if (!execution) {
      return res.status(404).send(`execution not found: ${executionId}`);
    }

    res.json({ execution });
  },
};

export const streamExecutionStdout: IRoute = {
  method: "get",
  path: "/executions/:id/stdout",
  async handler(req: Request, res: Response) {
    const executionId = parseInt(req.params.id, 10);

    if (isNaN(executionId)) {
      return res.status(400).send(`invalid execution ID: ${req.params.id}`);
    }

    try {
      const execution = await findExecutionById(executionId);

      if (!execution) {
        return res.status(404).send(`execution not found: ${executionId}`);
      }

      if (!execution.stdout_file) {
        return res
          .status(404)
          .send(`no stdout file found for execution: ${executionId}`);
      }

      log.debug(
        `streaming stdout file for execution ${executionId}:`,
        execution.stdout_file
      );

      // Initialize AWS S3 client
      const aws = Aws();

      // Get the file stream from S3
      const s3Response = await aws.getFile({
        filename: execution.stdout_file,
      });

      const body = s3Response.Body as Readable;

      if (!body) {
        return res.status(500).send(`failed to retrieve stdout file from S3`);
      }

      // Set appropriate headers
      res.setHeader("Content-Type", "text/plain");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${execution.stdout_file}"`
      );

      // Handle stream errors
      body.on("error", (err) => {
        log.error("error streaming stdout file:", err);
        if (!res.headersSent) {
          res.status(500).send("error streaming file");
        }
      });

      // pipe the S3 stream directly to the response
      body.pipe(res);
    } catch (error) {
      log.error("error in streamExecutionStdout:", error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  },
};
