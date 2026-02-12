import { EVMChainProvider } from "./EVMChainProvider";
import config, { SupportedChainId, ChainConfig } from "../config";
import log from "../logger";

export { EVMChainProvider } from "./EVMChainProvider";

/**
 * Factory for creating and managing chain providers
 */
export class ProviderFactory {
  private providers = new Map<SupportedChainId, EVMChainProvider>();
  private privateKey?: string;

  constructor(privateKey?: string) {
    this.privateKey = privateKey;
  }

  /**
   * Get or create a provider for a specific chain
   */
  getProvider(chainId: SupportedChainId): EVMChainProvider {
    if (!this.providers.has(chainId)) {
      const chainConfig = config.chains[chainId];
      if (!chainConfig) {
        throw new Error(`Chain ${chainId} not configured`);
      }

      const provider = new EVMChainProvider(
        chainId,
        chainConfig,
        this.privateKey
      );
      this.providers.set(chainId, provider);

      log.info({ chainId, name: chainConfig.name }, "Created chain provider");
    }

    return this.providers.get(chainId)!;
  }

  /**
   * Get providers for all supported chains
   */
  getAllProviders(): Map<SupportedChainId, EVMChainProvider> {
    for (const chainId of config.getSupportedChainIds()) {
      this.getProvider(chainId);
    }
    return this.providers;
  }

  /**
   * Initialize providers for specific chains
   */
  initializeProviders(chainIds: SupportedChainId[]): void {
    for (const chainId of chainIds) {
      this.getProvider(chainId);
    }
  }

  /**
   * Update state for all initialized providers
   */
  async updateAllStates(): Promise<void> {
    await Promise.all(
      Array.from(this.providers.values()).map((p) => p.updateState())
    );
  }

  /**
   * Clean up all providers
   */
  async destroy(): Promise<void> {
    await Promise.all(
      Array.from(this.providers.values()).map((p) => p.destroy())
    );
    this.providers.clear();
  }
}

// Default singleton instance
let defaultFactory: ProviderFactory | null = null;

export function getProviderFactory(privateKey?: string): ProviderFactory {
  if (!defaultFactory) {
    defaultFactory = new ProviderFactory(
      privateKey || config.execution.privateKey
    );
  }
  return defaultFactory;
}

export function resetProviderFactory(): void {
  if (defaultFactory) {
    defaultFactory.destroy();
    defaultFactory = null;
  }
}
