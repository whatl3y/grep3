import { db } from "../database";
import {
  EvmArbitragePool,
  NewEvmArbitragePool,
  EvmArbitragePoolUpdate,
} from "../types";

export async function findEvmArbitragePoolById(id: number) {
  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findEvmArbitragePoolByAddress(
  chainId: number,
  poolAddress: string
) {
  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .where("pool_address", "=", poolAddress.toLowerCase())
    .selectAll()
    .executeTakeFirst();
}

export async function findEvmArbitragePoolsByChain(chainId: number) {
  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .selectAll()
    .execute();
}

export async function findEvmArbitragePoolsByTokenPair(
  chainId: number,
  token0: string,
  token1: string
) {
  const t0 = token0.toLowerCase();
  const t1 = token1.toLowerCase();

  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .where((eb) =>
      eb.or([
        eb.and([eb("token0_address", "=", t0), eb("token1_address", "=", t1)]),
        eb.and([eb("token0_address", "=", t1), eb("token1_address", "=", t0)]),
      ])
    )
    .selectAll()
    .execute();
}

export async function findEvmArbitragePoolsByToken(
  chainId: number,
  tokenAddress: string
) {
  const addr = tokenAddress.toLowerCase();

  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .where((eb) =>
      eb.or([eb("token0_address", "=", addr), eb("token1_address", "=", addr)])
    )
    .selectAll()
    .execute();
}

export async function findEvmArbitragePoolsByDexType(
  chainId: number,
  dexType: string
) {
  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .where("dex_type", "=", dexType)
    .selectAll()
    .execute();
}

export async function findStalePools(chainId: number, olderThan: Date) {
  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .where((eb) =>
      eb.or([
        eb("last_synced_at", "<", olderThan.toISOString() as any),
        eb("last_synced_at", "is", null),
      ])
    )
    .selectAll()
    .execute();
}

export async function findEvmArbitragePools(
  criteria: Partial<EvmArbitragePool>
) {
  let query = db.selectFrom("evm_arbitrage_pools");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.chain_id) {
    query = query.where("chain_id", "=", criteria.chain_id);
  }

  if (criteria.dex_type) {
    query = query.where("dex_type", "=", criteria.dex_type);
  }

  if (criteria.pool_address) {
    query = query.where(
      "pool_address",
      "=",
      criteria.pool_address.toLowerCase()
    );
  }

  return await query.selectAll().execute();
}

export async function createEvmArbitragePool(pool: NewEvmArbitragePool) {
  return await db
    .insertInto("evm_arbitrage_pools")
    .values({
      ...pool,
      pool_address: pool.pool_address.toLowerCase(),
      token0_address: pool.token0_address.toLowerCase(),
      token1_address: pool.token1_address.toLowerCase(),
      extra_config: pool.extra_config
        ? (JSON.stringify(pool.extra_config) as any)
        : undefined,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function upsertEvmArbitragePool(pool: NewEvmArbitragePool) {
  const existing = await findEvmArbitragePoolByAddress(
    pool.chain_id,
    pool.pool_address
  );

  if (existing) {
    return await updateEvmArbitragePool(existing.id, {
      token0_address: pool.token0_address.toLowerCase(),
      token1_address: pool.token1_address.toLowerCase(),
      fee_tier: pool.fee_tier,
      is_stable: pool.is_stable,
      extra_config: pool.extra_config
        ? (JSON.stringify(pool.extra_config) as any)
        : undefined,
      last_synced_at: new Date().toISOString(),
    });
  }

  return await createEvmArbitragePool(pool);
}

export async function updateEvmArbitragePool(
  id: number,
  updateWith: EvmArbitragePoolUpdate
) {
  const values: any = { ...updateWith };
  if (updateWith.pool_address) {
    values.pool_address = updateWith.pool_address.toLowerCase();
  }
  if (updateWith.token0_address) {
    values.token0_address = updateWith.token0_address.toLowerCase();
  }
  if (updateWith.token1_address) {
    values.token1_address = updateWith.token1_address.toLowerCase();
  }
  if (updateWith.extra_config) {
    values.extra_config = JSON.stringify(updateWith.extra_config);
  }

  return await db
    .updateTable("evm_arbitrage_pools")
    .set(values)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function updatePoolLastSynced(id: number) {
  return await db
    .updateTable("evm_arbitrage_pools")
    .set({ last_synced_at: new Date().toISOString() as any })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteEvmArbitragePool(id: number) {
  return await db
    .deleteFrom("evm_arbitrage_pools")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function countPoolsByChain(chainId: number) {
  const result = await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirst();

  return result?.count || 0;
}

export async function countPoolsByDexType(chainId: number) {
  return await db
    .selectFrom("evm_arbitrage_pools")
    .where("chain_id", "=", chainId)
    .select(["dex_type"])
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .groupBy("dex_type")
    .execute();
}
