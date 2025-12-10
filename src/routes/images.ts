import assert from "assert";
import { Request, Response } from "express";
import { IRoute } from "./index";
import docker from "../libs/Docker";

export const images: IRoute = {
  method: "get",
  path: "/images",
  async handler(req: Request, res: Response) {
    try {
      const images = await docker.listImages();
      res.json({ images });
    } catch (err: any) {
      res.status(err.statusCode || 500).send(err.stack);
    }
  },
};

export const imageGet: IRoute = {
  method: "get",
  path: "/image/:hash",
  async handler(req: Request, res: Response) {
    try {
      const hash = req.params.hash;
      assert(typeof hash === "string", "hash exists");

      const image = docker.getImage(hash);
      res.json({ image: await image.inspect() });
    } catch (err: any) {
      res.status(err.statusCode || 500).send(err.stack);
    }
  },
};
