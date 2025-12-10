import assert from "assert";
import { Request, Response } from "express";
import { Readable } from "stream";
import { IRoute } from "./index";
// import log from '../logger'
import docker, { streamToBuffer } from "../libs/Docker";

export const containers: IRoute = {
  method: "get",
  path: "/containers",
  async handler(req: Request, res: Response) {
    try {
      const all =
        (req.query && req.query.all) || (req.body && req.body.all) || false;
      const containers = await docker.listContainers({ all });
      res.json({ containers });
    } catch (err: any) {
      res.status(err.statusCode || 500).send(err.stack);
    }
  },
};

export const getContainer: IRoute = {
  method: "get",
  path: "/container/:hash",
  async handler(req: Request, res: Response) {
    try {
      const hash = req.params.hash;
      assert(typeof hash === "string", "no hash available");

      const container = docker.getContainer(hash);
      res.json({ container: await container.inspect() });
    } catch (err: any) {
      res.status(err.statusCode || 500).send(err.stack);
    }
  },
};
