import { db } from "../database";
import {
  CryptoDailySummary,
  NewCryptoDailySummary,
  CryptoDailySummaryUpdate,
} from "../types";

export async function findCryptoDailySummaryById(id: number) {
  return await db
    .selectFrom("crypto_daily_summaries")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findCryptoDailySummaryByDate(summaryDate: string) {
  return await db
    .selectFrom("crypto_daily_summaries")
    .where("summary_date", "=", summaryDate as any)
    .selectAll()
    .executeTakeFirst();
}

export async function findRecentCryptoDailySummaries(limit: number = 30) {
  return await db
    .selectFrom("crypto_daily_summaries")
    .orderBy("summary_date", "desc")
    .limit(limit)
    .selectAll()
    .execute();
}

export async function findCryptoDailySummaries(
  criteria: Partial<CryptoDailySummary>
) {
  let query = db.selectFrom("crypto_daily_summaries");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.summary_date) {
    query = query.where("summary_date", "=", criteria.summary_date as any);
  }

  return await query.selectAll().execute();
}

export async function createCryptoDailySummary(summary: NewCryptoDailySummary) {
  return await db
    .insertInto("crypto_daily_summaries")
    .values(summary)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function upsertCryptoDailySummary(summary: NewCryptoDailySummary) {
  // Check if summary for this date already exists
  const existing = await findCryptoDailySummaryByDate(
    summary.summary_date as string
  );

  if (existing) {
    // Update existing summary
    return await updateCryptoDailySummary(existing.id, {
      summary_html: summary.summary_html,
      events: summary.events as any,
      references: summary.references as any,
      news_item_ids: summary.news_item_ids as any,
      total_sources_scanned: summary.total_sources_scanned,
      openai_model: summary.openai_model,
      openai_tokens_used: summary.openai_tokens_used,
      generated_at: summary.generated_at,
      updated_at: new Date().toISOString(),
    });
  }

  // Create new summary
  return await createCryptoDailySummary(summary);
}

export async function updateCryptoDailySummary(
  id: number,
  updateWith: CryptoDailySummaryUpdate
) {
  return await db
    .updateTable("crypto_daily_summaries")
    .set(updateWith)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteCryptoDailySummary(id: number) {
  return await db
    .deleteFrom("crypto_daily_summaries")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function getAvailableSummaryDates() {
  return await db
    .selectFrom("crypto_daily_summaries")
    .select("summary_date")
    .orderBy("summary_date", "desc")
    .execute();
}

/**
 * Get summaries from recent days (excluding current date) for deduplication
 * Returns the events array from each summary for comparing headlines
 */
export async function getRecentSummariesForDedup(
  currentDate: string,
  daysBack: number = 7
) {
  // Calculate the date range
  const fromDate = new Date(currentDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - daysBack);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  return await db
    .selectFrom("crypto_daily_summaries")
    .where("summary_date", "<", currentDate as any)
    .where("summary_date", ">=", fromDateStr as any)
    .select(["summary_date", "events"])
    .orderBy("summary_date", "desc")
    .execute();
}
