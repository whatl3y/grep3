import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("evm_arbitrage_opportunities")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("path", "jsonb", (col) => col.notNull())
    .addColumn("input_amount", "varchar(78)", (col) => col.notNull())
    .addColumn("expected_output", "varchar(78)", (col) => col.notNull())
    .addColumn("expected_profit_usd", "numeric(18, 8)")
    .addColumn("was_executed", "boolean", (col) =>
      col.defaultTo(false).notNull()
    )
    .addColumn("execution_id", "integer", (col) =>
      col.references("evm_arbitrage_executions.id").onDelete("set null")
    )
    .addColumn("found_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  // Index for analytics: opportunities by chain and time
  await db.schema
    .createIndex("idx_evm_arbitrage_opportunities_chain_time")
    .on("evm_arbitrage_opportunities")
    .columns(["chain_id", "found_at"])
    .execute();

  // Index for tracking executed vs missed opportunities
  await db.schema
    .createIndex("idx_evm_arbitrage_opportunities_executed")
    .on("evm_arbitrage_opportunities")
    .columns(["was_executed", "found_at"])
    .execute();

  // Index for joining with executions
  await db.schema
    .createIndex("idx_evm_arbitrage_opportunities_execution")
    .on("evm_arbitrage_opportunities")
    .column("execution_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("evm_arbitrage_opportunities").execute();
}
