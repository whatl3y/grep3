import { db } from "../database";
import {
  EvmArbitrageExecution,
  EvmArbitrageExecutionStatus,
  NewEvmArbitrageExecution,
  EvmArbitrageExecutionUpdate,
} from "../types";

export async function findEvmArbitrageExecutionById(id: number) {
  return await db
    .selectFrom("evm_arbitrage_executions")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findEvmArbitrageExecutionByTxHash(
  chainId: number,
  txHash: string
) {
  return await db
    .selectFrom("evm_arbitrage_executions")
    .where("chain_id", "=", chainId)
    .where("tx_hash", "=", txHash.toLowerCase())
    .selectAll()
    .executeTakeFirst();
}

export async function findEvmArbitrageExecutionsByStatus(
  status: EvmArbitrageExecutionStatus
) {
  return await db
    .selectFrom("evm_arbitrage_executions")
    .where("status", "=", status)
    .orderBy("executed_at", "desc")
    .selectAll()
    .execute();
}

export async function findPendingEvmArbitrageExecutions(chainId?: number) {
  let query = db
    .selectFrom("evm_arbitrage_executions")
    .where("status", "=", "pending");

  if (chainId) {
    query = query.where("chain_id", "=", chainId);
  }

  return await query.orderBy("executed_at", "asc").selectAll().execute();
}

export async function findEvmArbitrageExecutionsByChain(
  chainId: number,
  options?: { limit?: number; offset?: number }
) {
  let query = db
    .selectFrom("evm_arbitrage_executions")
    .where("chain_id", "=", chainId)
    .orderBy("executed_at", "desc");

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return await query.selectAll().execute();
}

export async function findEvmArbitrageExecutionsByDateRange(
  chainId: number,
  startDate: Date,
  endDate: Date
) {
  return await db
    .selectFrom("evm_arbitrage_executions")
    .where("chain_id", "=", chainId)
    .where("executed_at", ">=", startDate.toISOString() as any)
    .where("executed_at", "<=", endDate.toISOString() as any)
    .orderBy("executed_at", "desc")
    .selectAll()
    .execute();
}

export async function findEvmArbitrageExecutions(
  criteria: Partial<EvmArbitrageExecution>
) {
  let query = db.selectFrom("evm_arbitrage_executions");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.chain_id) {
    query = query.where("chain_id", "=", criteria.chain_id);
  }

  if (criteria.tx_hash) {
    query = query.where("tx_hash", "=", criteria.tx_hash.toLowerCase());
  }

  if (criteria.status) {
    query = query.where("status", "=", criteria.status);
  }

  return await query.selectAll().execute();
}

export async function createEvmArbitrageExecution(
  execution: NewEvmArbitrageExecution
) {
  return await db
    .insertInto("evm_arbitrage_executions")
    .values({
      ...execution,
      tx_hash: execution.tx_hash.toLowerCase(),
      input_token: execution.input_token.toLowerCase(),
      output_token: execution.output_token.toLowerCase(),
      path: JSON.stringify(execution.path) as any,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateEvmArbitrageExecution(
  id: number,
  updateWith: EvmArbitrageExecutionUpdate
) {
  const values: any = { ...updateWith };
  if (updateWith.tx_hash) {
    values.tx_hash = updateWith.tx_hash.toLowerCase();
  }
  if (updateWith.path) {
    values.path = JSON.stringify(updateWith.path);
  }

  return await db
    .updateTable("evm_arbitrage_executions")
    .set(values)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function updateEvmArbitrageExecutionStatus(
  id: number,
  status: EvmArbitrageExecutionStatus,
  txDetails?: {
    gas_used?: string;
    gas_price?: string;
    tx_cost?: string;
    net_profit?: string;
  }
) {
  return await db
    .updateTable("evm_arbitrage_executions")
    .set({
      status,
      ...txDetails,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteEvmArbitrageExecution(id: number) {
  return await db
    .deleteFrom("evm_arbitrage_executions")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

// Analytics functions

export async function countExecutionsByStatus(chainId: number) {
  return await db
    .selectFrom("evm_arbitrage_executions")
    .where("chain_id", "=", chainId)
    .select(["status"])
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .groupBy("status")
    .execute();
}

export async function getRecentSuccessfulExecutions(
  chainId: number,
  limit: number = 10
) {
  return await db
    .selectFrom("evm_arbitrage_executions")
    .where("chain_id", "=", chainId)
    .where("status", "=", "success")
    .orderBy("executed_at", "desc")
    .limit(limit)
    .selectAll()
    .execute();
}

export async function getTotalExecutionCount(chainId?: number) {
  let query = db.selectFrom("evm_arbitrage_executions");

  if (chainId) {
    query = query.where("chain_id", "=", chainId);
  }

  const result = await query
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirst();

  return result?.count || 0;
}

export async function getSuccessfulExecutionCount(chainId?: number) {
  let query = db
    .selectFrom("evm_arbitrage_executions")
    .where("status", "=", "success");

  if (chainId) {
    query = query.where("chain_id", "=", chainId);
  }

  const result = await query
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirst();

  return result?.count || 0;
}
