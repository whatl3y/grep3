import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("crypto_news_items")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("source_id", "integer", (col) =>
      col.references("crypto_news_sources.id").onDelete("cascade").notNull()
    )
    .addColumn("external_id", "varchar(512)")
    .addColumn("title", "varchar(1024)", (col) => col.notNull())
    .addColumn("content", "text")
    .addColumn("url", "varchar(2048)", (col) => col.notNull())
    .addColumn("author", "varchar(255)")
    .addColumn("published_at", "timestamp", (col) => col.notNull())
    .addColumn("relevance_score", "integer")
    .addColumn("summary_date", "date", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Unique constraint on source_id + external_id for deduplication
  await db.schema
    .createIndex("idx_crypto_news_items_source_external")
    .on("crypto_news_items")
    .columns(["source_id", "external_id"])
    .unique()
    .execute();

  // Index for fetching items by day, ordered by relevance
  await db.schema
    .createIndex("idx_crypto_news_items_summary_date_score")
    .on("crypto_news_items")
    .columns(["summary_date", "relevance_score"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("crypto_news_items").execute();
}
