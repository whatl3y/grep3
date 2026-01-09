import { db } from "../database";
import {
  CryptoNewsItem,
  NewCryptoNewsItem,
  CryptoNewsItemUpdate,
} from "../types";

export async function findCryptoNewsItemById(id: number) {
  return await db
    .selectFrom("crypto_news_items")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findCryptoNewsItemsByDate(summaryDate: string) {
  return await db
    .selectFrom("crypto_news_items")
    .where("summary_date", "=", summaryDate as any)
    .orderBy("relevance_score", "desc")
    .selectAll()
    .execute();
}

export async function findCryptoNewsItemsByDateWithSource(summaryDate: string) {
  return await db
    .selectFrom("crypto_news_items")
    .innerJoin(
      "crypto_news_sources",
      "crypto_news_items.source_id",
      "crypto_news_sources.id"
    )
    .where("crypto_news_items.summary_date", "=", summaryDate as any)
    .orderBy("crypto_news_items.relevance_score", "desc")
    .select([
      "crypto_news_items.id",
      "crypto_news_items.source_id",
      "crypto_news_items.external_id",
      "crypto_news_items.title",
      "crypto_news_items.content",
      "crypto_news_items.url",
      "crypto_news_items.author",
      "crypto_news_items.published_at",
      "crypto_news_items.relevance_score",
      "crypto_news_items.summary_date",
      "crypto_news_items.created_at",
      "crypto_news_sources.name as source_name",
    ])
    .execute();
}

export async function findCryptoNewsItemBySourceAndExternalId(
  sourceId: number,
  externalId: string
) {
  return await db
    .selectFrom("crypto_news_items")
    .where("source_id", "=", sourceId)
    .where("external_id", "=", externalId)
    .selectAll()
    .executeTakeFirst();
}

export async function findCryptoNewsItems(criteria: Partial<CryptoNewsItem>) {
  let query = db.selectFrom("crypto_news_items");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.source_id) {
    query = query.where("source_id", "=", criteria.source_id);
  }

  if (criteria.summary_date) {
    query = query.where("summary_date", "=", criteria.summary_date as any);
  }

  return await query.selectAll().execute();
}

export async function createCryptoNewsItem(item: NewCryptoNewsItem) {
  return await db
    .insertInto("crypto_news_items")
    .values(item)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function createCryptoNewsItemIfNotExists(item: NewCryptoNewsItem) {
  // Check if item with same source_id and external_id exists
  if (item.external_id) {
    const existing = await findCryptoNewsItemBySourceAndExternalId(
      item.source_id,
      item.external_id
    );
    if (existing) {
      return existing;
    }
  }

  return await createCryptoNewsItem(item);
}

export async function updateCryptoNewsItem(
  id: number,
  updateWith: CryptoNewsItemUpdate
) {
  return await db
    .updateTable("crypto_news_items")
    .set(updateWith)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function updateCryptoNewsItemsRelevanceScore(
  updates: { id: number; relevance_score: number }[]
) {
  for (const update of updates) {
    await db
      .updateTable("crypto_news_items")
      .set({ relevance_score: update.relevance_score })
      .where("id", "=", update.id)
      .execute();
  }
}

export async function deleteCryptoNewsItem(id: number) {
  return await db
    .deleteFrom("crypto_news_items")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function countCryptoNewsItemsByDate(summaryDate: string) {
  const result = await db
    .selectFrom("crypto_news_items")
    .where("summary_date", "=", summaryDate as any)
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirst();

  return result?.count || 0;
}
