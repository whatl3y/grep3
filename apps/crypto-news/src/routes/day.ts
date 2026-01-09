import { Request, Response } from "express";
import {
  findCryptoDailySummaryByDate,
  findCryptoNewsItemsByDateWithSource,
  SummaryEvent,
  SummaryReference,
} from "@grep3/core";
import { IRoute } from "./index";
import {
  getTodayUTC,
  addDays,
  subtractDays,
  formatDateForDisplay,
  isValidDateString,
} from "../libs/dateUtils";

/**
 * Enriches events with their inline references (up to 5 per event)
 */
function enrichEventsWithReferences(
  events: SummaryEvent[],
  references: SummaryReference[]
): (SummaryEvent & { inlineReferences: SummaryReference[] })[] {
  // Build a map of reference ID to reference
  const refMap = new Map<number, SummaryReference>();
  for (const ref of references) {
    refMap.set(ref.id, ref);
  }

  return events.map((event) => {
    // Get references for this event (up to 5)
    const eventRefs = (event.reference_ids || [])
      .map((id) => refMap.get(id))
      .filter((ref): ref is SummaryReference => !!ref)
      .slice(0, 5);

    return {
      ...event,
      inlineReferences: eventRefs,
    };
  });
}

export const viewDay: IRoute = {
  method: "get",
  path: "/day/:date",
  async handler(req: Request, res: Response) {
    const { date } = req.params;

    // Validate date format
    if (!isValidDateString(date)) {
      return res.status(400).render("error", {
        title: "Invalid Date",
        message: "Invalid date format. Please use YYYY-MM-DD format.",
      });
    }

    // Get summary from DB
    const summary = await findCryptoDailySummaryByDate(date);

    // Get adjacent dates for navigation
    const prevDate = subtractDays(date, 1);
    const nextDate = addDays(date, 1);
    const today = getTodayUTC();
    const hasNext = nextDate <= today;

    // Enrich events with inline references
    const events = summary?.events || [];
    const references = summary?.references || [];
    const enrichedEvents = enrichEventsWithReferences(events, references);

    // Render Pug template
    res.render("day", {
      title: `Crypto News - ${formatDateForDisplay(date)}`,
      date,
      displayDate: formatDateForDisplay(date),
      events: enrichedEvents,
      references,
      hasSummary: enrichedEvents.length > 0,
      prevDate,
      nextDate,
      hasNext,
      isToday: date === today,
      generatedAt: summary?.generated_at,
    });
  },
};

export const viewDayRaw: IRoute = {
  method: "get",
  path: "/day/:date/raw",
  async handler(req: Request, res: Response) {
    const { date } = req.params;

    // Validate date format
    if (!isValidDateString(date)) {
      return res.status(400).render("error", {
        title: "Invalid Date",
        message: "Invalid date format. Please use YYYY-MM-DD format.",
      });
    }

    // Get raw news items from DB
    const items = await findCryptoNewsItemsByDateWithSource(date);

    // Get adjacent dates for navigation
    const prevDate = subtractDays(date, 1);
    const nextDate = addDays(date, 1);
    const today = getTodayUTC();
    const hasNext = nextDate <= today;

    // Render Pug template
    res.render("day-raw", {
      title: `Raw News - ${formatDateForDisplay(date)}`,
      date,
      displayDate: formatDateForDisplay(date),
      items,
      itemCount: items.length,
      prevDate,
      nextDate,
      hasNext,
      isToday: date === today,
    });
  },
};
