import { config as coreConfig } from "@grep3/core";

// =============================================================================
// Chain Types
// =============================================================================

export type SupportedChainId = 1 | 42161 | 8453 | 56 | 137 | 10 | 43114;

export interface ChainConfig {
  chainId: SupportedChainId;
  name: string;
  rpcUrl: string;
  rpcUrlWs?: string;
  privateRpcUrl?: string; // Private RPC for tx execution (e.g., Flashbots, private mempool)
  blockTime: number; // Average block time in ms
  nativeSymbol: string;
  wrappedNative: string;
  gasLimit: number;
  maxPriorityFeeGwei: number;
  arbitrageContract: string;
  multicallAddress: string;
  swapperAddresses?: Record<string, string>; // DEX type -> swapper contract address
  // Flash loan providers
  balancerVault?: string;
  morpho?: string;
}

// =============================================================================
// DEX Types
// =============================================================================

export type DexType =
  | "uniswap_v2"
  | "uniswap_v3"
  | "uniswap_v4"
  | "algebra"
  | "solidly"
  | "curve"
  | "balancer";

export interface DexConfig {
  name: string;
  type: DexType;
  chainId: SupportedChainId;
  factory: string;
  router?: string;
  quoter?: string;
  poolManager?: string; // V4 only
  vault?: string; // Balancer only
  registry?: string; // Curve only
  feeTiers?: number[]; // V3/V4/Algebra
}

// =============================================================================
// Chain Configurations
// =============================================================================

export const chains: Record<SupportedChainId, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    chainId: 1,
    name: "ethereum",
    rpcUrl: process.env.ETH_RPC_URL || "https://rpc.mevblocker.io/norefunds",
    rpcUrlWs: process.env.ETH_WS_URL,
    privateRpcUrl: process.env.ETH_PRIVATE_RPC_URL,
    blockTime: 12000,
    nativeSymbol: "ETH",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    gasLimit: 500000,
    maxPriorityFeeGwei: 2,
    arbitrageContract: process.env.ETH_ARBITRAGE_CONTRACT || "",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  },
  // Arbitrum One
  42161: {
    chainId: 42161,
    name: "arbitrum",
    rpcUrl: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    rpcUrlWs: process.env.ARBITRUM_WS_URL,
    privateRpcUrl: process.env.ARBITRUM_PRIVATE_RPC_URL,
    blockTime: 250,
    nativeSymbol: "ETH",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    gasLimit: 3000000,
    maxPriorityFeeGwei: 0.1,
    arbitrageContract: process.env.ARBITRUM_ARBITRAGE_CONTRACT || "",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  },
  // Base
  8453: {
    chainId: 8453,
    name: "base",
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    rpcUrlWs: process.env.BASE_WS_URL,
    privateRpcUrl: process.env.BASE_PRIVATE_RPC_URL,
    blockTime: 2000,
    nativeSymbol: "ETH",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    gasLimit: 1000000,
    maxPriorityFeeGwei: 0.01,
    arbitrageContract: process.env.BASE_ARBITRAGE_CONTRACT || "",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  },
  // BSC
  56: {
    chainId: 56,
    name: "bsc",
    rpcUrl: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
    rpcUrlWs: process.env.BSC_WS_URL,
    privateRpcUrl: process.env.BSC_PRIVATE_RPC_URL,
    blockTime: 3000,
    nativeSymbol: "BNB",
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    gasLimit: 500000,
    maxPriorityFeeGwei: 1,
    arbitrageContract: process.env.BSC_ARBITRAGE_CONTRACT || "",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
  // Polygon
  137: {
    chainId: 137,
    name: "polygon",
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    rpcUrlWs: process.env.POLYGON_WS_URL,
    privateRpcUrl: process.env.POLYGON_PRIVATE_RPC_URL,
    blockTime: 2000,
    nativeSymbol: "MATIC",
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    gasLimit: 500000,
    maxPriorityFeeGwei: 30,
    arbitrageContract: process.env.POLYGON_ARBITRAGE_CONTRACT || "",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Optimism
  10: {
    chainId: 10,
    name: "optimism",
    rpcUrl: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
    rpcUrlWs: process.env.OPTIMISM_WS_URL,
    privateRpcUrl: process.env.OPTIMISM_PRIVATE_RPC_URL,
    blockTime: 2000,
    nativeSymbol: "ETH",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    gasLimit: 1000000,
    maxPriorityFeeGwei: 0.01,
    arbitrageContract: process.env.OPTIMISM_ARBITRAGE_CONTRACT || "",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  // Avalanche
  43114: {
    chainId: 43114,
    name: "avalanche",
    rpcUrl:
      process.env.AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
    rpcUrlWs: process.env.AVALANCHE_WS_URL,
    privateRpcUrl: process.env.AVALANCHE_PRIVATE_RPC_URL,
    blockTime: 2000,
    nativeSymbol: "AVAX",
    wrappedNative: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    gasLimit: 500000,
    maxPriorityFeeGwei: 1,
    arbitrageContract: process.env.AVALANCHE_ARBITRAGE_CONTRACT || "",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
};

// =============================================================================
// DEX Configurations
// =============================================================================

export const dexes: DexConfig[] = [
  // =========================================================================
  // Ethereum Mainnet
  // =========================================================================
  {
    name: "Uniswap V2",
    type: "uniswap_v2",
    chainId: 1,
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  },
  {
    name: "Uniswap V3",
    type: "uniswap_v3",
    chainId: 1,
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    feeTiers: [100, 500, 3000, 10000],
  },
  {
    name: "Uniswap V4",
    type: "uniswap_v4",
    chainId: 1,
    factory: "0x0000000000000000000000000000000000000000", // Pool keys via events
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    feeTiers: [100, 500, 3000, 10000],
  },
  {
    name: "SushiSwap",
    type: "uniswap_v2",
    chainId: 1,
    factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
    router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  },
  {
    name: "ShibaSwap",
    type: "uniswap_v2",
    chainId: 1,
    factory: "0x115934131916C8b277DD010Ee02de363c09d037c",
    router: "0x03f7724180AA6b939894B5Ca4314783B0b36b329",
  },
  {
    name: "Curve",
    type: "curve",
    chainId: 1,
    factory: "0x0959158b6040D32d04c301A72CBFD6b39E21c9AE",
    registry: "0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2cd46d",
  },
  {
    name: "Balancer",
    type: "balancer",
    chainId: 1,
    factory: "0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9",
    vault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },

  // =========================================================================
  // Arbitrum
  // =========================================================================
  {
    name: "Uniswap V3",
    type: "uniswap_v3",
    chainId: 42161,
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    feeTiers: [100, 500, 3000, 10000],
  },
  {
    name: "Camelot V2",
    type: "uniswap_v2",
    chainId: 42161,
    factory: "0x6EcCab422D763aC031210895C81787E87B43A652",
    router: "0xc873fEcbd354f5A56E00E710B90EF4201db2448d",
  },
  {
    name: "Camelot V3",
    type: "algebra",
    chainId: 42161,
    factory: "0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B",
    router: "0x1F721E2E82F6676FCE4eA07A5958cF098D339e18",
  },
  {
    name: "SushiSwap",
    type: "uniswap_v2",
    chainId: 42161,
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  },
  {
    name: "Balancer",
    type: "balancer",
    chainId: 42161,
    factory: "0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9",
    vault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  {
    name: "Curve",
    type: "curve",
    chainId: 42161,
    factory: "0xb17b674D9c5CB2e441F8e196a2f048A81355d031",
  },

  // =========================================================================
  // Base
  // =========================================================================
  {
    name: "Uniswap V3",
    type: "uniswap_v3",
    chainId: 8453,
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    feeTiers: [100, 500, 3000, 10000],
  },
  {
    name: "Aerodrome V2",
    type: "solidly",
    chainId: 8453,
    factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
    router: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  },
  {
    name: "Aerodrome SlipStream",
    type: "algebra",
    chainId: 8453,
    factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
    router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
  },

  // =========================================================================
  // BSC
  // =========================================================================
  {
    name: "PancakeSwap V2",
    type: "uniswap_v2",
    chainId: 56,
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  },
  {
    name: "PancakeSwap V3",
    type: "uniswap_v3",
    chainId: 56,
    factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    router: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
    quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
    feeTiers: [100, 500, 2500, 10000],
  },
  {
    name: "BabyDogeSwap",
    type: "uniswap_v2",
    chainId: 56,
    factory: "0x4693B62E5Fc9c0a45F89D62e6300a03c85f43137",
    router: "0xC9a0F685F39d05D835c369036251ee3aEaaF3c47",
  },
  {
    name: "Uniswap V3",
    type: "uniswap_v3",
    chainId: 56,
    factory: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
    router: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
    feeTiers: [100, 500, 3000, 10000],
  },

  // =========================================================================
  // Polygon
  // =========================================================================
  {
    name: "Uniswap V3",
    type: "uniswap_v3",
    chainId: 137,
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    feeTiers: [100, 500, 3000, 10000],
  },
  {
    name: "QuickSwap V2",
    type: "uniswap_v2",
    chainId: 137,
    factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
    router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  },
  {
    name: "QuickSwap V3",
    type: "algebra",
    chainId: 137,
    factory: "0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28",
    router: "0xf5b509bB0909a69B1c207E495f687a596C168E12",
  },
  {
    name: "SushiSwap",
    type: "uniswap_v2",
    chainId: 137,
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  },
  {
    name: "Balancer",
    type: "balancer",
    chainId: 137,
    factory: "0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9",
    vault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
  {
    name: "Curve",
    type: "curve",
    chainId: 137,
    factory: "0x722272D36ef0Da72FF51c5A65Db7b870E2e8D4ee",
  },

  // =========================================================================
  // Optimism
  // =========================================================================
  {
    name: "Uniswap V3",
    type: "uniswap_v3",
    chainId: 10,
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    feeTiers: [100, 500, 3000, 10000],
  },
  {
    name: "Velodrome V2",
    type: "solidly",
    chainId: 10,
    factory: "0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a",
    router: "0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858",
  },

  // =========================================================================
  // Avalanche
  // =========================================================================
  {
    name: "Trader Joe V1",
    type: "uniswap_v2",
    chainId: 43114,
    factory: "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10",
    router: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4",
  },
  {
    name: "Uniswap V3",
    type: "uniswap_v3",
    chainId: 43114,
    factory: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
    router: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
    feeTiers: [100, 500, 3000, 10000],
  },
  {
    name: "Pangolin",
    type: "uniswap_v2",
    chainId: 43114,
    factory: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88",
    router: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106",
  },
];

// =============================================================================
// Application Configuration
// =============================================================================

const config = {
  ...coreConfig,

  appName: process.env.APP_NAME || "@grep3/evm-arbitrage",

  // Scanner settings
  scanner: {
    poolScanInterval: parseInt(process.env.POOL_SCAN_INTERVAL || "60000", 10), // 1 minute
    reserveUpdateInterval: parseInt(
      process.env.RESERVE_UPDATE_INTERVAL || "1000",
      10,
    ), // 1 second
    maxPoolsPerDex: parseInt(process.env.MAX_POOLS_PER_DEX || "1000", 10),
  },

  // Path finder settings
  pathfinder: {
    maxHops: parseInt(process.env.MAX_HOPS || "3", 10),
    minLiquidityUsd: parseFloat(process.env.MIN_LIQUIDITY_USD || "10000"),
  },

  // Execution settings
  execution: {
    enabled: process.env.EXECUTION_ENABLED === "true",
    // Optional pre-filter - contract will revert if not profitable after gas anyway
    minProfitWei: BigInt(process.env.MIN_PROFIT_WEI || "10000000000000"), // 0.00001 ETH
    maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || "50", 10), // 0.5%
    privateKey: process.env.PRIVATE_KEY || "",
    bribeBps: parseInt(process.env.BRIBE_BPS || "0", 10), // 0-10000 basis points (% of profit to bribe, where 10000 = 100%)
    flashLoanProvider: process.env.FLASH_LOAN_PROVIDER || "morpho", // "balancer" or "morpho"
  },

  // Cache TTLs (in seconds)
  cache: {
    poolTtl: parseInt(process.env.POOL_CACHE_TTL || "3600", 10), // 1 hour
    reserveTtl: parseInt(process.env.RESERVE_CACHE_TTL || "10", 10), // 10 seconds
    tokenTtl: parseInt(process.env.TOKEN_CACHE_TTL || "86400", 10), // 24 hours
  },

  // Chain and DEX configs
  chains,
  dexes,

  // Helper functions
  getChain(chainId: SupportedChainId): ChainConfig {
    const chain = chains[chainId];
    if (!chain) {
      throw new Error(`Chain ${chainId} not configured`);
    }
    return chain;
  },

  getDexesForChain(chainId: SupportedChainId): DexConfig[] {
    return dexes.filter((dex) => dex.chainId === chainId);
  },

  getSupportedChainIds(): SupportedChainId[] {
    return Object.keys(chains).map(Number) as SupportedChainId[];
  },
};

export default config;
