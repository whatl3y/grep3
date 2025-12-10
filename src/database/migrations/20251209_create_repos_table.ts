import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("repos")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("address", "varchar(255)", (col) => col.notNull())
    .addColumn("internal_name", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("repos").execute();
}
