import { Express, Request, Response } from "express";
import * as home from "./home";
import * as day from "./day";
import * as api from "./api";

export interface IRoute {
  method?: "get" | "post" | "patch" | "delete" | "all";
  path: string;
  handler: (req: Request, res: Response) => Promise<unknown> | unknown;
}

export default function bindRoutes(app: Express) {
  const allRoutes = [home, day, api];
  allRoutes.forEach((routes) => {
    Object.values(routes).forEach((route: IRoute) => {
      app[route.method || "get"](route.path, route.handler);
    });
  });
}
