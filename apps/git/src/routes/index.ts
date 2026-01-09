import { Express, Request, Response } from "express";
import * as root from "./root";
import * as view from "./view";
import * as auth from "./auth";

export interface IRoute {
  method?: "get" | "post" | "patch" | "delete" | "all";
  path: string;
  handler: (req: Request, res: Response) => Promise<unknown> | unknown;
}

export default function bindRoutes(app: Express) {
  const allRoutes = [root, view, auth];
  allRoutes.forEach((routes) => {
    Object.values(routes).forEach((route: IRoute) => {
      app[route.method || "get"](route.path, route.handler);
    });
  });
}
