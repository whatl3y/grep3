import { db } from "../database";
import {
  EvmArbitrageOpportunity,
  NewEvmArbitrageOpportunity,
  EvmArbitrageOpportunityUpdate,
} from "../types";

export async function findEvmArbitrageOpportunityById(id: number) {
  return await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findEvmArbitrageOpportunitiesByChain(
  chainId: number,
  options?: { limit?: number; offset?: number }
) {
  let query = db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .orderBy("found_at", "desc");

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return await query.selectAll().execute();
}

export async function findEvmArbitrageOpportunitiesByDateRange(
  chainId: number,
  startDate: Date,
  endDate: Date
) {
  return await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .where("found_at", ">=", startDate.toISOString() as any)
    .where("found_at", "<=", endDate.toISOString() as any)
    .orderBy("found_at", "desc")
    .selectAll()
    .execute();
}

export async function findExecutedOpportunities(chainId: number) {
  return await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .where("was_executed", "=", true)
    .orderBy("found_at", "desc")
    .selectAll()
    .execute();
}

export async function findMissedOpportunities(
  chainId: number,
  limit: number = 100
) {
  return await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .where("was_executed", "=", false)
    .orderBy("expected_profit_usd", "desc")
    .limit(limit)
    .selectAll()
    .execute();
}

export async function findEvmArbitrageOpportunitiesByExecution(
  executionId: number
) {
  return await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("execution_id", "=", executionId)
    .selectAll()
    .execute();
}

export async function findEvmArbitrageOpportunities(
  criteria: Partial<EvmArbitrageOpportunity>
) {
  let query = db.selectFrom("evm_arbitrage_opportunities");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.chain_id) {
    query = query.where("chain_id", "=", criteria.chain_id);
  }

  if (criteria.was_executed !== undefined) {
    query = query.where("was_executed", "=", criteria.was_executed);
  }

  if (criteria.execution_id) {
    query = query.where("execution_id", "=", criteria.execution_id);
  }

  return await query.selectAll().execute();
}

export async function createEvmArbitrageOpportunity(
  opportunity: NewEvmArbitrageOpportunity
) {
  return await db
    .insertInto("evm_arbitrage_opportunities")
    .values({
      ...opportunity,
      path: JSON.stringify(opportunity.path) as any,
      expected_profit_usd: opportunity.expected_profit_usd
        ? (String(opportunity.expected_profit_usd) as any)
        : undefined,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateEvmArbitrageOpportunity(
  id: number,
  updateWith: EvmArbitrageOpportunityUpdate
) {
  const values: any = { ...updateWith };
  if (updateWith.path) {
    values.path = JSON.stringify(updateWith.path);
  }
  if (updateWith.expected_profit_usd !== undefined) {
    values.expected_profit_usd = String(updateWith.expected_profit_usd);
  }

  return await db
    .updateTable("evm_arbitrage_opportunities")
    .set(values)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function markOpportunityAsExecuted(
  id: number,
  executionId: number
) {
  return await db
    .updateTable("evm_arbitrage_opportunities")
    .set({
      was_executed: true,
      execution_id: executionId,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteEvmArbitrageOpportunity(id: number) {
  return await db
    .deleteFrom("evm_arbitrage_opportunities")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

// Analytics functions

export async function countOpportunitiesByChain(chainId: number) {
  const result = await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .select((eb) => [eb.fn.count<number>("id").as("total")])
    .executeTakeFirst();

  return result?.total || 0;
}

export async function getOpportunityStats(chainId: number) {
  const executed = await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .where("was_executed", "=", true)
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirst();

  const missed = await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .where("was_executed", "=", false)
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirst();

  return {
    executed: executed?.count || 0,
    missed: missed?.count || 0,
  };
}

export async function getRecentOpportunities(
  chainId: number,
  limit: number = 50
) {
  return await db
    .selectFrom("evm_arbitrage_opportunities")
    .where("chain_id", "=", chainId)
    .orderBy("found_at", "desc")
    .limit(limit)
    .selectAll()
    .execute();
}
