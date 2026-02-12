import { db } from "../database";
import {
  EvmArbitrageWhitelistedToken,
  NewEvmArbitrageWhitelistedToken,
  EvmArbitrageWhitelistedTokenUpdate,
} from "../types";

export async function findEvmArbitrageWhitelistedTokenById(id: number) {
  return await db
    .selectFrom("evm_arbitrage_whitelisted_tokens")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findEvmArbitrageWhitelistedTokenByAddress(
  chainId: number,
  tokenAddress: string
) {
  return await db
    .selectFrom("evm_arbitrage_whitelisted_tokens")
    .where("chain_id", "=", chainId)
    .where("token_address", "=", tokenAddress.toLowerCase())
    .selectAll()
    .executeTakeFirst();
}

export async function findActiveEvmArbitrageWhitelistedTokens(chainId: number) {
  return await db
    .selectFrom("evm_arbitrage_whitelisted_tokens")
    .where("chain_id", "=", chainId)
    .where("is_active", "=", true)
    .selectAll()
    .execute();
}

export async function findAllActiveEvmArbitrageWhitelistedTokens() {
  return await db
    .selectFrom("evm_arbitrage_whitelisted_tokens")
    .where("is_active", "=", true)
    .selectAll()
    .execute();
}

export async function findEvmArbitrageWhitelistedTokens(
  criteria: Partial<EvmArbitrageWhitelistedToken>
) {
  let query = db.selectFrom("evm_arbitrage_whitelisted_tokens");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.chain_id) {
    query = query.where("chain_id", "=", criteria.chain_id);
  }

  if (criteria.token_address) {
    query = query.where(
      "token_address",
      "=",
      criteria.token_address.toLowerCase()
    );
  }

  if (criteria.symbol) {
    query = query.where("symbol", "=", criteria.symbol);
  }

  if (criteria.is_active !== undefined) {
    query = query.where("is_active", "=", criteria.is_active);
  }

  return await query.selectAll().execute();
}

export async function createEvmArbitrageWhitelistedToken(
  token: NewEvmArbitrageWhitelistedToken
) {
  return await db
    .insertInto("evm_arbitrage_whitelisted_tokens")
    .values({
      ...token,
      token_address: token.token_address.toLowerCase(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function upsertEvmArbitrageWhitelistedToken(
  token: NewEvmArbitrageWhitelistedToken
) {
  const existing = await findEvmArbitrageWhitelistedTokenByAddress(
    token.chain_id,
    token.token_address
  );

  if (existing) {
    return await updateEvmArbitrageWhitelistedToken(existing.id, {
      symbol: token.symbol,
      decimals: token.decimals,
      is_active: token.is_active,
      updated_at: new Date().toISOString(),
    });
  }

  return await createEvmArbitrageWhitelistedToken(token);
}

export async function updateEvmArbitrageWhitelistedToken(
  id: number,
  updateWith: EvmArbitrageWhitelistedTokenUpdate
) {
  return await db
    .updateTable("evm_arbitrage_whitelisted_tokens")
    .set({
      ...updateWith,
      updated_at: new Date().toISOString(),
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteEvmArbitrageWhitelistedToken(id: number) {
  return await db
    .deleteFrom("evm_arbitrage_whitelisted_tokens")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function setEvmArbitrageWhitelistedTokenActive(
  id: number,
  isActive: boolean
) {
  return await updateEvmArbitrageWhitelistedToken(id, { is_active: isActive });
}

export async function getUniqueChainIds() {
  const results = await db
    .selectFrom("evm_arbitrage_whitelisted_tokens")
    .select("chain_id")
    .distinct()
    .execute();

  return results.map((r) => r.chain_id);
}
