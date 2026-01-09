import { readFileSync } from "fs";
import { join } from "path";
import { Express, Request, Response } from "express";
import * as prices from "./prices";

export interface IRoute {
  method?: "get" | "post" | "patch" | "delete" | "all";
  path: string;
  handler: (req: Request, res: Response) => Promise<void> | void;
}

// Load templates at startup
const TEMPLATES_DIR = join(__dirname, "..", "..", "templates");
const INDEX_HTML = readFileSync(join(TEMPLATES_DIR, "index.html"), "utf-8");

export function getTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, `${name}.html`), "utf-8");
}

export default function bindRoutes(app: Express) {
  const allRoutes = [prices];

  allRoutes.forEach((routes) => {
    Object.values(routes).forEach((route: IRoute) => {
      app[route.method || "get"](route.path, route.handler);
    });
  });

  // Health check endpoint
  app.get("/health/check", (_: Request, res: Response) => res.sendStatus(204));

  // Root endpoint with HTML documentation
  app.get("/", (_: Request, res: Response) => {
    res.type("html").send(INDEX_HTML);
  });
}
