import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("repos")
    .addColumn("auth_nonce", "integer", (col) =>
      // Default to a random value for existing repos
      col.defaultTo(sql`floor(random() * 2147483647)::integer`).notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("repos").dropColumn("auth_nonce").execute();
}
