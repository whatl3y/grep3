import { JsonRpcProvider, WebSocketProvider, Wallet } from "ethers";
import { IChainProvider, ChainState } from "../types/chain";
import { SupportedChainId, ChainConfig } from "../config";
import log from "../logger";

export class EVMChainProvider implements IChainProvider {
  private provider: JsonRpcProvider;
  private privateProvider: JsonRpcProvider | null = null;
  private wsProvider: WebSocketProvider | null = null;
  private wallet: Wallet | null = null;
  private privateWallet: Wallet | null = null; // Wallet connected to private RPC for tx execution
  private state: ChainState;

  constructor(
    public readonly chainId: SupportedChainId,
    public readonly config: ChainConfig,
    privateKey?: string
  ) {
    this.provider = new JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: config.name,
    });

    if (config.rpcUrlWs) {
      try {
        this.wsProvider = new WebSocketProvider(config.rpcUrlWs, {
          chainId: config.chainId,
          name: config.name,
        });
      } catch (err) {
        log.warn(
          { chainId, err },
          "Failed to create WebSocket provider, falling back to HTTP"
        );
      }
    }

    if (privateKey) {
      this.wallet = new Wallet(privateKey, this.provider);

      // Create private wallet if private RPC is configured
      if (config.privateRpcUrl) {
        this.privateProvider = new JsonRpcProvider(config.privateRpcUrl, {
          chainId: config.chainId,
          name: config.name,
        });
        this.privateWallet = new Wallet(privateKey, this.privateProvider);
        log.info({ chainId }, "Created private RPC wallet for tx execution");
      }
    }

    this.state = {
      chainId,
      blockNumber: 0,
      gasPrice: 0n,
      maxPriorityFeePerGas: 0n,
      lastUpdated: 0,
    };
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  getWsProvider(): WebSocketProvider | null {
    return this.wsProvider;
  }

  getWallet(): Wallet | null {
    return this.wallet;
  }

  getPrivateWallet(): Wallet | null {
    return this.privateWallet;
  }

  async getBlockNumber(): Promise<number> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      this.state.blockNumber = blockNumber;
      this.state.lastUpdated = Date.now();
      return blockNumber;
    } catch (err) {
      log.error({ chainId: this.chainId, err }, "Failed to get block number");
      throw err;
    }
  }

  async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;
      this.state.gasPrice = gasPrice;
      this.state.lastUpdated = Date.now();
      return gasPrice;
    } catch (err) {
      log.error({ chainId: this.chainId, err }, "Failed to get gas price");
      throw err;
    }
  }

  async getMaxPriorityFeePerGas(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      const maxPriorityFee = feeData.maxPriorityFeePerGas || 0n;
      this.state.maxPriorityFeePerGas = maxPriorityFee;
      this.state.lastUpdated = Date.now();
      return maxPriorityFee;
    } catch (err) {
      log.error(
        { chainId: this.chainId, err },
        "Failed to get max priority fee"
      );
      throw err;
    }
  }

  async updateState(): Promise<ChainState> {
    const [blockNumber, gasPrice, maxPriorityFeePerGas] = await Promise.all([
      this.getBlockNumber(),
      this.getGasPrice(),
      this.getMaxPriorityFeePerGas(),
    ]);

    this.state = {
      chainId: this.chainId,
      blockNumber,
      gasPrice,
      maxPriorityFeePerGas,
      lastUpdated: Date.now(),
    };

    return this.state;
  }

  getState(): ChainState {
    return this.state;
  }

  /**
   * Subscribe to new blocks via WebSocket
   */
  onBlock(callback: (blockNumber: number) => void): void {
    const provider = this.wsProvider || this.provider;
    provider.on("block", callback);
  }

  /**
   * Unsubscribe from block events
   */
  offBlock(callback: (blockNumber: number) => void): void {
    const provider = this.wsProvider || this.provider;
    provider.off("block", callback);
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.wsProvider) {
      await this.wsProvider.destroy();
    }
    if (this.privateProvider) {
      await this.privateProvider.destroy();
    }
    await this.provider.destroy();
  }
}
