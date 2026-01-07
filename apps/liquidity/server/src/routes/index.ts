import { Express, Request, Response } from "express";
import * as pools from "./pools";

export interface IRoute {
  method?: "get" | "post" | "patch" | "delete" | "all";
  path: string;
  handler: (req: Request, res: Response) => Promise<void> | void;
}

export default function bindRoutes(app: Express) {
  const allRoutes = [pools];
  allRoutes.forEach((routes) => {
    Object.values(routes).forEach((route: IRoute) => {
      app[route.method || "get"](route.path, route.handler);
    });
  });

  app.get("/health/check", (_: Request, res: Response) => res.sendStatus(204));
}
