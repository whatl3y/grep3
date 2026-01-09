import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("crypto_news_sources")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("source_type", "varchar(50)", (col) => col.notNull())
    .addColumn("url", "varchar(1024)", (col) => col.notNull())
    .addColumn("config", "jsonb")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true).notNull())
    .addColumn("last_scraped_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Index on is_active for filtering active sources
  await db.schema
    .createIndex("idx_crypto_news_sources_is_active")
    .on("crypto_news_sources")
    .column("is_active")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("crypto_news_sources").execute();
}
