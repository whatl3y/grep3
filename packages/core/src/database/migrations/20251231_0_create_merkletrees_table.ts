import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("merkletrees")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("root_hash", "varchar(255)", (col) => col.notNull())
    .addColumn("job_uuid", "varchar(255)", (col) => col.notNull())
    .addColumn("job_status", "varchar(255)", (col) => col.notNull())
    .addColumn("job_status_info", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Create index on root_hash for faster queries
  await db.schema
    .createIndex("merkletrees_root_hash_idx")
    .on("merkletrees")
    .column("root_hash")
    .execute();

  // Create index on job_uuid for status queries
  await db.schema
    .createIndex("merkletrees_job_uuid_idx")
    .on("merkletrees")
    .column("job_uuid")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("merkletrees").execute();
}
