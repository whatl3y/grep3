import {
  findCryptoNewsItemsByDateWithSource,
  updateCryptoNewsItemsRelevanceScore,
  upsertCryptoDailySummary,
  countCryptoNewsItemsByDate,
  getRecentSummariesForDedup,
  SummaryReference,
  SummaryEvent,
} from "@grep3/core";
import { scoreNewsItems, generateDailySummaryContent } from "./OpenAIService";
import { deduplicateEvents } from "./DeduplicationService";
import log from "../logger";

export async function generateDailySummary(date: string): Promise<{
  success: boolean;
  eventCount: number;
  tokensUsed: number;
}> {
  log.info(`Generating daily summary for ${date}`);

  // Get all items for the day with source info
  const items = await findCryptoNewsItemsByDateWithSource(date);

  if (items.length === 0) {
    log.info(`No news items found for ${date}, skipping summary generation`);
    return { success: false, eventCount: 0, tokensUsed: 0 };
  }

  log.info(`Found ${items.length} items for ${date}`);

  // Score items that don't have a relevance score yet
  const unscoredItems = items.filter((i) => i.relevance_score === null);
  if (unscoredItems.length > 0) {
    log.info(`Scoring ${unscoredItems.length} unscored items`);

    // Batch scoring in groups of 20
    const batchSize = 20;
    for (let i = 0; i < unscoredItems.length; i += batchSize) {
      const batch = unscoredItems.slice(i, i + batchSize);
      const scores = await scoreNewsItems(
        batch.map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content,
        }))
      );

      // Update scores in database
      const updates = scores.map((s) => ({
        id: s.id,
        relevance_score: s.score,
      }));

      if (updates.length > 0) {
        await updateCryptoNewsItemsRelevanceScore(updates);
        log.debug(`Updated ${updates.length} item scores`);
      }
    }
  }

  // Re-fetch items with updated scores
  const scoredItems = await findCryptoNewsItemsByDateWithSource(date);

  // Sort by relevance score descending
  scoredItems.sort(
    (a, b) => (b.relevance_score || 0) - (a.relevance_score || 0)
  );

  // Get recent events to exclude from this summary (prevent duplicates)
  const recentSummaries = await getRecentSummariesForDedup(date, 7);
  const recentEventHeadlines: string[] = [];
  for (const summary of recentSummaries) {
    const events = summary.events as SummaryEvent[] | null;
    if (events) {
      for (const event of events) {
        recentEventHeadlines.push(event.headline);
      }
    }
  }

  log.info(`Found ${recentEventHeadlines.length} recent event headlines to exclude`);

  // Generate summary using AI
  log.info(`Generating AI summary from top ${Math.min(30, scoredItems.length)} items`);

  const summaryResult = await generateDailySummaryContent(date, scoredItems, recentEventHeadlines);

  // Deduplicate events against recent days
  log.info("Checking for duplicate events from recent days...");
  const { events: dedupedEvents, duplicatesRemoved } = await deduplicateEvents(
    summaryResult.events,
    date
  );

  if (duplicatesRemoved > 0) {
    log.info(`Removed ${duplicatesRemoved} duplicate events`);
  }

  // Add popularity score to each event (count of reference sources)
  const eventsWithPopularity: SummaryEvent[] = dedupedEvents.map((event) => ({
    ...event,
    popularity_score: event.reference_ids?.length || 1,
  }));

  // Build references array from the items used
  const usedItemIds = new Set<number>();
  for (const event of eventsWithPopularity) {
    for (const refId of event.reference_ids || []) {
      usedItemIds.add(refId);
    }
  }

  const references: SummaryReference[] = scoredItems
    .filter((i) => usedItemIds.has(i.id))
    .map((i) => ({
      id: i.id,
      title: i.title,
      source_name: i.source_name,
      url: i.url,
      published_at: i.published_at.toISOString(),
      relevance_score: i.relevance_score || 0,
    }));

  // Get total count for metadata
  const totalScanned = await countCryptoNewsItemsByDate(date);

  // Save summary to database
  await upsertCryptoDailySummary({
    summary_date: date,
    summary_html: summaryResult.html,
    events: JSON.stringify(eventsWithPopularity) as any,
    references: JSON.stringify(references) as any,
    news_item_ids: JSON.stringify(Array.from(usedItemIds)) as any,
    total_sources_scanned: Number(totalScanned),
    openai_model: summaryResult.model,
    openai_tokens_used: summaryResult.tokensUsed,
    generated_at: new Date().toISOString(),
  });

  log.info(
    `Successfully generated summary for ${date}: ${eventsWithPopularity.length} events (${duplicatesRemoved} duplicates removed), ${summaryResult.tokensUsed} tokens`
  );

  return {
    success: true,
    eventCount: eventsWithPopularity.length,
    tokensUsed: summaryResult.tokensUsed,
  };
}
