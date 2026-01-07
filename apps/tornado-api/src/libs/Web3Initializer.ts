import Web3 from "web3";
import Web3Instances from "./Web3";
import { addAccountToWeb3 } from "./Wallets";
import config from "../config";
import log from "../logger";

export interface IWeb3Manager {
  initialize(): Promise<void>;
  getInstance(networkId?: number): Web3;
  getAllInstances(): { [key: number]: Web3 };
  isInitialized(): boolean;
}

/**
 * Create a Web3 manager that encapsulates the Web3 instances state
 * This avoids module-level state and provides a clean factory pattern
 */
function createWeb3Manager(): IWeb3Manager {
  let web3Instances: { [key: number]: Web3 } = {};
  let initialized = false;

  async function initialize(): Promise<void> {
    if (initialized) {
      log.warn("Web3 instances already initialized, skipping");
      return;
    }

    try {
      web3Instances = await Web3Instances();

      // Add relay account to all web3 instances
      Object.keys(web3Instances).forEach((key: string) => {
        const w3 = web3Instances[parseInt(key)];
        addAccountToWeb3(w3, config.withdrawalPkey);
      });

      initialized = true;
      log.info("Web3 instances initialized successfully", {
        networks: Object.keys(web3Instances),
      });
    } catch (err) {
      log.error("Failed to initialize Web3 instances", err);
      throw err;
    }
  }

  function getInstance(networkId?: number): Web3 {
    if (!initialized) {
      throw new Error(
        "Web3 instances not initialized. Call initializeWeb3() first."
      );
    }

    const netId = networkId || 1; // Default to mainnet
    if (!web3Instances[netId]) {
      throw new Error(`Web3 instance not available for network ${netId}`);
    }

    return web3Instances[netId];
  }

  function getAllInstances(): { [key: number]: Web3 } {
    if (!initialized) {
      throw new Error(
        "Web3 instances not initialized. Call initializeWeb3() first."
      );
    }

    return web3Instances;
  }

  function isInitialized(): boolean {
    return initialized;
  }

  return { initialize, getInstance, getAllInstances, isInitialized };
}

// Create singleton manager instance via factory
const web3Manager = createWeb3Manager();

/**
 * Initialize Web3 instances for all configured networks
 * Should be called once during application startup
 */
export async function initializeWeb3(): Promise<void> {
  return web3Manager.initialize();
}

/**
 * Get Web3 instance for a specific network
 * @param networkId - The network ID (defaults to 1 for mainnet)
 * @returns Web3 instance for the specified network
 * @throws Error if Web3 instances are not initialized or network is not available
 */
export function getWeb3Instance(networkId?: number): Web3 {
  return web3Manager.getInstance(networkId);
}

/**
 * Get all initialized Web3 instances
 * @returns Object mapping network IDs to Web3 instances
 */
export function getAllWeb3Instances(): { [key: number]: Web3 } {
  return web3Manager.getAllInstances();
}

/**
 * Check if Web3 instances have been initialized
 */
export function isWeb3Initialized(): boolean {
  return web3Manager.isInitialized();
}
