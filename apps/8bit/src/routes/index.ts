import { Express } from "express";
import * as convert from "./convert";

export interface IRoute {
  method?: "get" | "post" | "put" | "delete" | "all";
  path: string;
  handler: any;
}

export default function bindRoutes(app: Express) {
  const allRoutes = [convert];

  allRoutes.forEach((routes) => {
    Object.values(routes).forEach((route: IRoute) => {
      app[route.method || "get"](route.path, route.handler);
    });
  });
}
