import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("twitter_bot_voice_profiles")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("twitter_username", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("profile_data", "jsonb", (col) => col.notNull())
    .addColumn("tweets_analyzed", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_analyzed_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("idx_twitter_bot_voice_profiles_username")
    .on("twitter_bot_voice_profiles")
    .column("twitter_username")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("twitter_bot_voice_profiles").execute();
}
