import { /*Application,*/ Express, Request, Response } from "express";
import * as root from "./root";

export interface IRoute {
  method?: "get" | "post" | "path" | "delete" | "all";
  path: string;
  // handler: Application
  handler: any;
}

export default function bindRoutes(app: Express) {
  const allRoutes = [root];
  allRoutes.forEach((routes) => {
    Object.values(routes).forEach((route: IRoute) => {
      app[route.method || "get"](route.path, route.handler);
    });
  });

  app.get("/status", (_: Request, res: Response) => res.sendStatus(204));
}
