import { db } from "../database";
import {
  CryptoNewsSource,
  NewCryptoNewsSource,
  CryptoNewsSourceUpdate,
} from "../types";

export async function findCryptoNewsSourceById(id: number) {
  return await db
    .selectFrom("crypto_news_sources")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findActiveCryptoNewsSources() {
  return await db
    .selectFrom("crypto_news_sources")
    .where("is_active", "=", true)
    .selectAll()
    .execute();
}

export async function findCryptoNewsSources(criteria: Partial<CryptoNewsSource>) {
  let query = db.selectFrom("crypto_news_sources");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.name) {
    query = query.where("name", "=", criteria.name);
  }

  if (criteria.source_type) {
    query = query.where("source_type", "=", criteria.source_type);
  }

  if (criteria.is_active !== undefined) {
    query = query.where("is_active", "=", criteria.is_active);
  }

  return await query.selectAll().execute();
}

export async function createCryptoNewsSource(source: NewCryptoNewsSource) {
  return await db
    .insertInto("crypto_news_sources")
    .values(source)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateCryptoNewsSource(
  id: number,
  updateWith: CryptoNewsSourceUpdate
) {
  return await db
    .updateTable("crypto_news_sources")
    .set(updateWith)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteCryptoNewsSource(id: number) {
  return await db
    .deleteFrom("crypto_news_sources")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
