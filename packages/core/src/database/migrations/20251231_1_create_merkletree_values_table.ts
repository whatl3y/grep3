import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("merkletree_values")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("merkletree_id", "integer", (col) =>
      col.references("merkletrees.id").onDelete("cascade").notNull()
    )
    .addColumn("unique_id", "varchar(255)", (col) => col.notNull())
    .addColumn("values", "text", (col) => col.notNull())
    .addColumn("proof", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Create unique constraint on merkletree_id + unique_id
  await db.schema
    .createIndex("merkletree_values_unique_idx")
    .on("merkletree_values")
    .columns(["merkletree_id", "unique_id"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("merkletree_values").execute();
}
