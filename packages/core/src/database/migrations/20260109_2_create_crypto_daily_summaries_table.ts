import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("crypto_daily_summaries")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("summary_date", "date", (col) => col.notNull().unique())
    .addColumn("summary_html", "text")
    .addColumn("events", "jsonb")
    .addColumn("references", "jsonb")
    .addColumn("news_item_ids", "jsonb")
    .addColumn("total_sources_scanned", "integer")
    .addColumn("openai_model", "varchar(100)")
    .addColumn("openai_tokens_used", "integer")
    .addColumn("generated_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Primary lookup is by date
  await db.schema
    .createIndex("idx_crypto_daily_summaries_date")
    .on("crypto_daily_summaries")
    .column("summary_date")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("crypto_daily_summaries").execute();
}
