import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("twitter_bot_generated_tweets")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("twitter_username", "varchar(255)", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("topic", "varchar(255)")
    .addColumn("format", "varchar(100)")
    .addColumn("engagement_score", "integer")
    .addColumn("reasoning", "text")
    .addColumn("status", "varchar(50)", (col) => col.notNull().defaultTo("pending"))
    .addColumn("scheduled_for", "timestamp")
    .addColumn("posted_at", "timestamp")
    .addColumn("twitter_tweet_id", "varchar(255)")
    .addColumn("post_metrics", "jsonb")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("idx_twitter_bot_generated_tweets_username")
    .on("twitter_bot_generated_tweets")
    .column("twitter_username")
    .execute();

  await db.schema
    .createIndex("idx_twitter_bot_generated_tweets_status")
    .on("twitter_bot_generated_tweets")
    .column("status")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("twitter_bot_generated_tweets").execute();
}
