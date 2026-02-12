import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("evm_arbitrage_pools")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("dex_type", "varchar(50)", (col) => col.notNull())
    .addColumn("pool_address", "varchar(42)", (col) => col.notNull())
    .addColumn("token0_address", "varchar(42)", (col) => col.notNull())
    .addColumn("token1_address", "varchar(42)", (col) => col.notNull())
    .addColumn("fee_tier", "integer")
    .addColumn("is_stable", "boolean")
    .addColumn("extra_config", "jsonb")
    .addColumn("last_synced_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Unique constraint on chain_id + pool_address
  await db.schema
    .createIndex("idx_evm_arbitrage_pools_chain_pool")
    .on("evm_arbitrage_pools")
    .columns(["chain_id", "pool_address"])
    .unique()
    .execute();

  // Index for finding pools by token pair (for pathfinding)
  await db.schema
    .createIndex("idx_evm_arbitrage_pools_chain_tokens")
    .on("evm_arbitrage_pools")
    .columns(["chain_id", "token0_address", "token1_address"])
    .execute();

  // Index for filtering by dex_type
  await db.schema
    .createIndex("idx_evm_arbitrage_pools_chain_dex")
    .on("evm_arbitrage_pools")
    .columns(["chain_id", "dex_type"])
    .execute();

  // Index for finding stale pools that need resyncing
  await db.schema
    .createIndex("idx_evm_arbitrage_pools_last_synced")
    .on("evm_arbitrage_pools")
    .column("last_synced_at")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("evm_arbitrage_pools").execute();
}
