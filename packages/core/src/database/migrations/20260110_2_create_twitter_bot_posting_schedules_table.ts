import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("twitter_bot_posting_schedules")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("twitter_username", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("tweets_per_day", "integer", (col) => col.notNull().defaultTo(3))
    .addColumn("min_hours_between_posts", "integer", (col) => col.notNull().defaultTo(4))
    .addColumn("preferred_hours", sql`integer[]`, (col) => col.defaultTo(sql`ARRAY[9, 12, 15, 18, 21]`))
    .addColumn("topics", sql`text[]`, (col) => col.notNull().defaultTo(sql`ARRAY['software development', 'crypto', 'web3']::text[]`))
    .addColumn("auto_post", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("last_post_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("idx_twitter_bot_posting_schedules_username")
    .on("twitter_bot_posting_schedules")
    .column("twitter_username")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("twitter_bot_posting_schedules").execute();
}
