import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("evm_arbitrage_config")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("config_key", "varchar(255)", (col) => col.notNull())
    .addColumn("config_value", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Unique constraint on chain_id + config_key
  await db.schema
    .createIndex("idx_evm_arbitrage_config_chain_key")
    .on("evm_arbitrage_config")
    .columns(["chain_id", "config_key"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("evm_arbitrage_config").execute();
}
