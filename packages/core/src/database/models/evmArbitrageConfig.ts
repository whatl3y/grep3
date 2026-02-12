import { db } from "../database";
import {
  EvmArbitrageConfig,
  NewEvmArbitrageConfig,
  EvmArbitrageConfigUpdate,
} from "../types";

// Common config keys
export const EVM_ARBITRAGE_CONFIG_KEYS = {
  CONTRACT_ADDRESS: "contract_address",
  MIN_PROFIT_THRESHOLD_USD: "min_profit_threshold_usd",
  MIN_PROFIT_THRESHOLD_WEI: "min_profit_threshold_wei",
  MAX_GAS_PRICE_GWEI: "max_gas_price_gwei",
  FLASHLOAN_PROVIDER: "flashloan_provider",
  ENABLED: "enabled",
  MAX_HOPS: "max_hops",
  SLIPPAGE_BPS: "slippage_bps",
} as const;

export async function findEvmArbitrageConfigById(id: number) {
  return await db
    .selectFrom("evm_arbitrage_config")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findEvmArbitrageConfigByKey(
  chainId: number,
  configKey: string
) {
  return await db
    .selectFrom("evm_arbitrage_config")
    .where("chain_id", "=", chainId)
    .where("config_key", "=", configKey)
    .selectAll()
    .executeTakeFirst();
}

export async function getEvmArbitrageConfigValue(
  chainId: number,
  configKey: string
): Promise<string | null> {
  const config = await findEvmArbitrageConfigByKey(chainId, configKey);
  return config?.config_value ?? null;
}

export async function findEvmArbitrageConfigsByChain(chainId: number) {
  return await db
    .selectFrom("evm_arbitrage_config")
    .where("chain_id", "=", chainId)
    .selectAll()
    .execute();
}

export async function getEvmArbitrageConfigMap(
  chainId: number
): Promise<Record<string, string>> {
  const configs = await findEvmArbitrageConfigsByChain(chainId);
  return configs.reduce(
    (acc, config) => {
      acc[config.config_key] = config.config_value;
      return acc;
    },
    {} as Record<string, string>
  );
}

export async function findEvmArbitrageConfigs(
  criteria: Partial<EvmArbitrageConfig>
) {
  let query = db.selectFrom("evm_arbitrage_config");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.chain_id) {
    query = query.where("chain_id", "=", criteria.chain_id);
  }

  if (criteria.config_key) {
    query = query.where("config_key", "=", criteria.config_key);
  }

  return await query.selectAll().execute();
}

export async function createEvmArbitrageConfig(config: NewEvmArbitrageConfig) {
  return await db
    .insertInto("evm_arbitrage_config")
    .values(config)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function setEvmArbitrageConfig(
  chainId: number,
  configKey: string,
  configValue: string
) {
  const existing = await findEvmArbitrageConfigByKey(chainId, configKey);

  if (existing) {
    return await updateEvmArbitrageConfig(existing.id, {
      config_value: configValue,
      updated_at: new Date().toISOString(),
    });
  }

  return await createEvmArbitrageConfig({
    chain_id: chainId,
    config_key: configKey,
    config_value: configValue,
  });
}

export async function setEvmArbitrageConfigs(
  chainId: number,
  configs: Record<string, string>
) {
  const results: EvmArbitrageConfig[] = [];
  for (const [key, value] of Object.entries(configs)) {
    const result = await setEvmArbitrageConfig(chainId, key, value);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

export async function updateEvmArbitrageConfig(
  id: number,
  updateWith: EvmArbitrageConfigUpdate
) {
  return await db
    .updateTable("evm_arbitrage_config")
    .set({
      ...updateWith,
      updated_at: new Date().toISOString(),
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteEvmArbitrageConfig(id: number) {
  return await db
    .deleteFrom("evm_arbitrage_config")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteEvmArbitrageConfigByKey(
  chainId: number,
  configKey: string
) {
  return await db
    .deleteFrom("evm_arbitrage_config")
    .where("chain_id", "=", chainId)
    .where("config_key", "=", configKey)
    .returningAll()
    .executeTakeFirst();
}

// Convenience functions for typed config access

export async function getContractAddress(
  chainId: number
): Promise<string | null> {
  return getEvmArbitrageConfigValue(
    chainId,
    EVM_ARBITRAGE_CONFIG_KEYS.CONTRACT_ADDRESS
  );
}

export async function getMinProfitThresholdUsd(
  chainId: number
): Promise<number | null> {
  const value = await getEvmArbitrageConfigValue(
    chainId,
    EVM_ARBITRAGE_CONFIG_KEYS.MIN_PROFIT_THRESHOLD_USD
  );
  return value ? parseFloat(value) : null;
}

export async function getMaxGasPriceGwei(
  chainId: number
): Promise<number | null> {
  const value = await getEvmArbitrageConfigValue(
    chainId,
    EVM_ARBITRAGE_CONFIG_KEYS.MAX_GAS_PRICE_GWEI
  );
  return value ? parseFloat(value) : null;
}

export async function isChainEnabled(chainId: number): Promise<boolean> {
  const value = await getEvmArbitrageConfigValue(
    chainId,
    EVM_ARBITRAGE_CONFIG_KEYS.ENABLED
  );
  return value === "true";
}

export async function getMaxHops(chainId: number): Promise<number> {
  const value = await getEvmArbitrageConfigValue(
    chainId,
    EVM_ARBITRAGE_CONFIG_KEYS.MAX_HOPS
  );
  return value ? parseInt(value, 10) : 3;
}

export async function getSlippageBps(chainId: number): Promise<number> {
  const value = await getEvmArbitrageConfigValue(
    chainId,
    EVM_ARBITRAGE_CONFIG_KEYS.SLIPPAGE_BPS
  );
  return value ? parseInt(value, 10) : 50;
}
