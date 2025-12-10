// import assert from "assert";
import { getAddress, isAddress } from "ethers";
import { Request, Response } from "express";
import { IRoute } from "./index";
import { findExecutions } from "../database/models/executions";
import { findRepoByAddressAndName } from "../database/models/repos";
import log from "../logger";

export const images: IRoute = {
  method: "get",
  path: "/executions/:address/:repo",
  async handler(req: Request, res: Response) {
    const address = req.params.address;
    if (!isAddress(address)) {
      return res.status(400).send(`invalid address provided: ${address}`);
    }
    const repo = /.git$/.test(req.params.repo)
      ? req.params.repo
      : `${req.params.repo}.git`;
    const repoObject = await findRepoByAddressAndName(
      getAddress(address),
      repo
    );
    if (!repoObject) {
      return res.status(404).send(`No repo`);
    }
    const executions = await findExecutions({ repo_id: repoObject.id });
    log.debug(`executions found`, address, repo);
    res.json({ executions });
  },
};
