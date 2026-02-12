import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("evm_arbitrage_executions")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("input_token", "varchar(42)", (col) => col.notNull())
    .addColumn("output_token", "varchar(42)", (col) => col.notNull())
    .addColumn("input_amount", "varchar(78)", (col) => col.notNull()) // uint256 as string
    .addColumn("output_amount", "varchar(78)", (col) => col.notNull())
    .addColumn("profit_amount", "varchar(78)", (col) => col.notNull())
    .addColumn("gas_used", "varchar(78)")
    .addColumn("gas_price", "varchar(78)")
    .addColumn("tx_cost", "varchar(78)")
    .addColumn("net_profit", "varchar(78)")
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("pending")
    )
    .addColumn("path", "jsonb", (col) => col.notNull())
    .addColumn("executed_at", "timestamp", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Unique constraint on chain_id + tx_hash
  await db.schema
    .createIndex("idx_evm_arbitrage_executions_chain_tx")
    .on("evm_arbitrage_executions")
    .columns(["chain_id", "tx_hash"])
    .unique()
    .execute();

  // Index for querying by status (monitoring pending transactions)
  await db.schema
    .createIndex("idx_evm_arbitrage_executions_status")
    .on("evm_arbitrage_executions")
    .column("status")
    .execute();

  // Index for analytics queries by chain and time
  await db.schema
    .createIndex("idx_evm_arbitrage_executions_chain_time")
    .on("evm_arbitrage_executions")
    .columns(["chain_id", "executed_at"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("evm_arbitrage_executions").execute();
}
