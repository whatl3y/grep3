import { JsonRpcProvider, WebSocketProvider, Wallet } from "ethers";
import { SupportedChainId, ChainConfig } from "../config";

export interface IChainProvider {
  chainId: SupportedChainId;
  config: ChainConfig;

  getProvider(): JsonRpcProvider;
  getWsProvider(): WebSocketProvider | null;
  getWallet(): Wallet | null;

  getBlockNumber(): Promise<number>;
  getGasPrice(): Promise<bigint>;
  getMaxPriorityFeePerGas(): Promise<bigint>;
}

export interface ChainState {
  chainId: SupportedChainId;
  blockNumber: number;
  gasPrice: bigint;
  maxPriorityFeePerGas: bigint;
  lastUpdated: number;
}
