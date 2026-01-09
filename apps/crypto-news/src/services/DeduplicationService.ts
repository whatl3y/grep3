import { getRecentSummariesForDedup, SummaryEvent } from "@grep3/core";
import log from "../logger";

/**
 * Normalize a headline for comparison by:
 * - Converting to lowercase
 * - Removing common words and punctuation
 * - Extracting key entities (numbers, names, tokens)
 */
function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^\w\s%$]/g, " ")
    .replace(
      /\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|as|is|was|are|were|has|have|had|be|been|being|that|this|these|those|it|its|after|before|during|while|about|into|through|over|under|between|among|against|within|without|since|until|upon|across|along|around|behind|below|beneath|beside|besides|beyond|despite|except|inside|outside|toward|towards|throughout|underneath|upon|versus|via|within|without)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract key entities from a headline (tokens, percentages, amounts)
 * Normalizes values to improve matching (e.g., 99.9% -> 99%, $26M -> $26 million)
 */
function extractKeyEntities(headline: string): Set<string> {
  const entities = new Set<string>();

  // Extract crypto tokens (2-5 letter uppercase words)
  const tokens = headline.match(/\b[A-Z]{2,5}\b/g);
  if (tokens) tokens.forEach((t) => entities.add(t.toLowerCase()));

  // Extract percentages - normalize to integer (99.9% -> 99%)
  const percentages = headline.match(/\d+(?:\.\d+)?%/g);
  if (percentages) {
    percentages.forEach((p) => {
      // Round to nearest integer for fuzzy matching
      const num = Math.round(parseFloat(p));
      entities.add(`${num}%`);
    });
  }

  // Extract dollar amounts - normalize to base number
  const amounts = headline.match(/\$[\d,.]+\s*(?:million|billion|M|B|K)?/gi);
  if (amounts) {
    amounts.forEach((a) => {
      // Normalize: $26M, $26 million, $26,000,000 all become "26m"
      const normalized = a
        .toLowerCase()
        .replace(/[$,\s]/g, "")
        .replace(/million/g, "m")
        .replace(/billion/g, "b")
        .replace(/thousand/g, "k");
      entities.add(normalized);
    });
  }

  // Extract standalone large numbers (likely prices or amounts)
  const numbers = headline.match(/\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g);
  if (numbers) {
    numbers.forEach((n) => {
      // Remove commas and decimals for fuzzy matching
      const normalized = n.replace(/,/g, "").split(".")[0];
      entities.add(normalized);
    });
  }

  // Extract key crypto/finance words that indicate the same story
  const keyWords = headline.toLowerCase().match(/\b(exploit|hack|crash|surge|plunge|fall|drop|rise|rally|sec|etf|approval|reject|ban|lawsuit|settlement)\b/g);
  if (keyWords) keyWords.forEach((w) => entities.add(w));

  return entities;
}

/**
 * Calculate similarity between two headlines (0-1 scale)
 */
function calculateSimilarity(headline1: string, headline2: string): number {
  const norm1 = normalizeHeadline(headline1);
  const norm2 = normalizeHeadline(headline2);

  // Quick exact match
  if (norm1 === norm2) return 1;

  // Word overlap (Jaccard similarity)
  const words1 = new Set(norm1.split(" ").filter((w) => w.length > 2));
  const words2 = new Set(norm2.split(" ").filter((w) => w.length > 2));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const wordSimilarity =
    union.size > 0 ? intersection.size / union.size : 0;

  // Entity overlap (higher weight)
  const entities1 = extractKeyEntities(headline1);
  const entities2 = extractKeyEntities(headline2);

  const entityIntersection = new Set(
    [...entities1].filter((x) => entities2.has(x))
  );
  const entityUnion = new Set([...entities1, ...entities2]);

  const entitySimilarity =
    entityUnion.size > 0 ? entityIntersection.size / entityUnion.size : 0;

  // Combined score (entities weighted more heavily)
  return wordSimilarity * 0.4 + entitySimilarity * 0.6;
}

interface DuplicateMatch {
  originalDate: string;
  originalHeadline: string;
  similarity: number;
}

/**
 * Check if a headline is similar to any event from recent days
 * Returns the match info if found, null otherwise
 */
export async function findDuplicateEvent(
  headline: string,
  currentDate: string,
  similarityThreshold: number = 0.4 // Lowered from 0.5 to catch more duplicates
): Promise<DuplicateMatch | null> {
  const recentSummaries = await getRecentSummariesForDedup(currentDate, 7);

  log.debug(`Checking "${headline}" against ${recentSummaries.length} recent summaries`);

  for (const summary of recentSummaries) {
    const events = summary.events as SummaryEvent[] | null;
    if (!events) continue;

    for (const event of events) {
      // Skip events that are themselves marked as duplicates
      if (event.is_duplicate) continue;

      const similarity = calculateSimilarity(headline, event.headline);

      // Log high-ish similarities for debugging
      if (similarity >= 0.3) {
        log.debug(
          `Similarity ${(similarity * 100).toFixed(0)}%: "${headline.substring(0, 50)}..." vs "${event.headline.substring(0, 50)}..."`
        );
      }

      if (similarity >= similarityThreshold) {
        const summaryDate =
          summary.summary_date instanceof Date
            ? summary.summary_date.toISOString().split("T")[0]
            : String(summary.summary_date);

        log.info(
          `Found duplicate: "${headline}" matches "${event.headline}" (${(similarity * 100).toFixed(0)}% similar) from ${summaryDate}`
        );

        return {
          originalDate: summaryDate,
          originalHeadline: event.headline,
          similarity,
        };
      }
    }
  }

  return null;
}

/**
 * Process events and mark duplicates
 * Returns filtered events (duplicates removed) and stats
 */
export async function deduplicateEvents(
  events: SummaryEvent[],
  currentDate: string
): Promise<{
  events: SummaryEvent[];
  duplicatesRemoved: number;
}> {
  const processedEvents: SummaryEvent[] = [];
  let duplicatesRemoved = 0;

  for (const event of events) {
    const duplicate = await findDuplicateEvent(event.headline, currentDate);

    if (duplicate) {
      log.info(
        `Removing duplicate event: "${event.headline}" (first reported ${duplicate.originalDate})`
      );
      duplicatesRemoved++;
      // Skip this event entirely - don't include duplicates
    } else {
      processedEvents.push(event);
    }
  }

  // Re-rank the remaining events
  processedEvents.forEach((event, index) => {
    event.rank = index + 1;
  });

  return {
    events: processedEvents,
    duplicatesRemoved,
  };
}
