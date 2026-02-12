import { JsonRpcProvider } from "ethers";
import { DexType, DexConfig } from "../config";
import { IDexAdapter } from "../types/dex";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { UniswapV2Adapter } from "./UniswapV2Adapter";
import { UniswapV3Adapter } from "./UniswapV3Adapter";
import { UniswapV4Adapter } from "./UniswapV4Adapter";
import { AlgebraAdapter } from "./AlgebraAdapter";
import { SolidlyAdapter } from "./SolidlyAdapter";
import { CurveAdapter } from "./CurveAdapter";
import { BalancerAdapter } from "./BalancerAdapter";
import log from "../logger";

export { BaseDexAdapter } from "./BaseDexAdapter";
export { UniswapV2Adapter } from "./UniswapV2Adapter";
export { UniswapV3Adapter } from "./UniswapV3Adapter";
export { UniswapV4Adapter } from "./UniswapV4Adapter";
export { AlgebraAdapter } from "./AlgebraAdapter";
export { SolidlyAdapter } from "./SolidlyAdapter";
export { CurveAdapter } from "./CurveAdapter";
export { BalancerAdapter } from "./BalancerAdapter";

/**
 * Factory for creating DEX adapters based on DEX type
 */
export function createDexAdapter(
  dexConfig: DexConfig,
  provider: JsonRpcProvider
): IDexAdapter {
  switch (dexConfig.type) {
    case "uniswap_v2":
      return new UniswapV2Adapter(dexConfig, provider);

    case "uniswap_v3":
      return new UniswapV3Adapter(dexConfig, provider);

    case "uniswap_v4":
      return new UniswapV4Adapter(dexConfig, provider);

    case "algebra":
      return new AlgebraAdapter(dexConfig, provider);

    case "solidly":
      return new SolidlyAdapter(dexConfig, provider);

    case "curve":
      return new CurveAdapter(dexConfig, provider);

    case "balancer":
      return new BalancerAdapter(dexConfig, provider);

    default:
      throw new Error(`Unsupported DEX type: ${dexConfig.type}`);
  }
}

/**
 * Create adapters for all DEXes on a specific chain
 */
export function createDexAdaptersForChain(
  dexConfigs: DexConfig[],
  provider: JsonRpcProvider
): Map<string, IDexAdapter> {
  const adapters = new Map<string, IDexAdapter>();

  for (const dexConfig of dexConfigs) {
    try {
      const adapter = createDexAdapter(dexConfig, provider);
      adapters.set(dexConfig.name, adapter);
      log.debug(
        { dexName: dexConfig.name, dexType: dexConfig.type },
        "Created DEX adapter"
      );
    } catch (err) {
      log.error(
        { dexName: dexConfig.name, dexType: dexConfig.type, err },
        "Failed to create DEX adapter"
      );
    }
  }

  return adapters;
}
