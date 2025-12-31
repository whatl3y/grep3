import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("executions")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("repo_id", "integer", (col) =>
      col.references("repos.id").onDelete("cascade").notNull()
    )
    .addColumn("image_hash", "varchar(255)")
    .addColumn("container_hash", "varchar(255)")
    .addColumn("stdout_file", "varchar(255)")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("executions").execute();
}
