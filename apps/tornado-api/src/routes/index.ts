import { Express, Request, Response } from "express";
import * as tornado from "./tornado";
// import * as root from "./root";

export interface IRoute {
  method?: "get" | "post" | "patch" | "delete" | "all";
  path: string;
  handler: any;
}

export default function bindRoutes(app: Express) {
  const allRoutes = [tornado];
  allRoutes.forEach((routes) => {
    Object.values(routes).forEach((route: IRoute) => {
      app[route.method || "get"](route.path, route.handler);
    });
  });

  app.get("/health/check", (_: Request, res: Response) => res.sendStatus(204));
}
