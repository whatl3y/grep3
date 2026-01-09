import { Request, Response } from "express";
import { IRoute } from "./index";
import { getTodayUTC } from "../libs/dateUtils";

export const home: IRoute = {
  method: "get",
  path: "/",
  async handler(req: Request, res: Response) {
    const today = getTodayUTC();
    res.redirect(`/day/${today}`);
  },
};

export const healthCheck: IRoute = {
  method: "get",
  path: "/health",
  async handler(req: Request, res: Response) {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  },
};
