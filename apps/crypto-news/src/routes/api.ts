import { Request, Response } from "express";
import {
  findCryptoDailySummaryByDate,
  findCryptoNewsItemsByDate,
  findRecentCryptoDailySummaries,
} from "@grep3/core";
import { IRoute } from "./index";
import { isValidDateString } from "../libs/dateUtils";
import { BackgroundWorker } from "@grep3/core";
import redis from "../redis";
import config from "../config";

const worker = BackgroundWorker(redis);

export const getSummary: IRoute = {
  method: "get",
  path: "/api/summary/:date",
  async handler(req: Request, res: Response) {
    const { date } = req.params;

    if (!isValidDateString(date)) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    const summary = await findCryptoDailySummaryByDate(date);

    if (!summary) {
      return res.status(404).json({ error: "No summary found for this date" });
    }

    res.json({
      date: summary.summary_date,
      events: summary.events,
      references: summary.references,
      totalSourcesScanned: summary.total_sources_scanned,
      generatedAt: summary.generated_at,
    });
  },
};

export const getItems: IRoute = {
  method: "get",
  path: "/api/items/:date",
  async handler(req: Request, res: Response) {
    const { date } = req.params;

    if (!isValidDateString(date)) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    const items = await findCryptoNewsItemsByDate(date);

    res.json({
      date,
      count: items.length,
      items,
    });
  },
};

export const getRecentSummaries: IRoute = {
  method: "get",
  path: "/api/summaries/recent",
  async handler(req: Request, res: Response) {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const summaries = await findRecentCryptoDailySummaries(limit);

    res.json({
      count: summaries.length,
      summaries: summaries.map((s) => ({
        date: s.summary_date,
        eventCount: s.events?.length || 0,
        generatedAt: s.generated_at,
      })),
    });
  },
};

export const triggerRefresh: IRoute = {
  method: "post",
  path: "/api/refresh/:date",
  async handler(req: Request, res: Response) {
    const { date } = req.params;

    if (!isValidDateString(date)) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    try {
      // Enqueue a summary generation job
      await worker.enqueue(
        "generateDailySummary",
        { date },
        config.resque.summarization
      );

      res.json({
        success: true,
        message: `Summary regeneration queued for ${date}`,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

export const triggerScrape: IRoute = {
  method: "post",
  path: "/api/scrape",
  async handler(req: Request, res: Response) {
    try {
      // Enqueue a scrape all sources job
      await worker.enqueue("scrapeAllSources", {}, config.resque.scraping);

      res.json({
        success: true,
        message: "Scraping job queued for all sources",
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};
