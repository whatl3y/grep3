import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("evm_arbitrage_whitelisted_tokens")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("token_address", "varchar(42)", (col) => col.notNull())
    .addColumn("symbol", "varchar(32)", (col) => col.notNull())
    .addColumn("decimals", "integer", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true).notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Unique constraint on chain_id + token_address
  await db.schema
    .createIndex("idx_evm_arbitrage_whitelisted_tokens_chain_address")
    .on("evm_arbitrage_whitelisted_tokens")
    .columns(["chain_id", "token_address"])
    .unique()
    .execute();

  // Index for filtering active tokens by chain
  await db.schema
    .createIndex("idx_evm_arbitrage_whitelisted_tokens_chain_active")
    .on("evm_arbitrage_whitelisted_tokens")
    .columns(["chain_id", "is_active"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("evm_arbitrage_whitelisted_tokens").execute();
}
