import { config } from "@grep3/core";

const appName = process.env.APP_NAME || "@grep3/liquidity-server";

// Chain configuration with RPC URLs and contract addresses
// Reference: https://docs.uniswap.org/contracts/v3/reference/deployments/
export interface ChainConfig {
  chainId: number;
  name: string;
  displayName: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  wrappedNative: string;
  uniswap: {
    v3: {
      factory: string;
      quoterV2: string;
      nftPositionManager: string;
      tickLens: string;
    };
    // V4 is only on Ethereum mainnet for now
    v4?: {
      poolManager: string;
      positionManager: string;
      stateView: string;
    };
  };
}

// Default public RPC URLs (users should override with their own for production)
const defaultRpcUrls: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
};

export const chains: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    chainId: 1,
    name: "ethereum",
    displayName: "Ethereum",
    rpcUrl: process.env.ETH_RPC_URL || defaultRpcUrls[1],
    blockExplorer: "https://etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    uniswap: {
      v3: {
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        nftPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        tickLens: "0xbfd8137f7d1516D3ea5cA83523914859ec47F573",
      },
      v4: {
        poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
        positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
        stateView: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227",
      },
    },
  },

  // Arbitrum One
  42161: {
    chainId: 42161,
    name: "arbitrum",
    displayName: "Arbitrum One",
    rpcUrl: process.env.ARBITRUM_RPC_URL || defaultRpcUrls[42161],
    blockExplorer: "https://arbiscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    uniswap: {
      v3: {
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        nftPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        tickLens: "0xbfd8137f7d1516D3ea5cA83523914859ec47F573",
      },
    },
  },

  // Optimism
  10: {
    chainId: 10,
    name: "optimism",
    displayName: "Optimism",
    rpcUrl: process.env.OPTIMISM_RPC_URL || defaultRpcUrls[10],
    blockExplorer: "https://optimistic.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    wrappedNative: "0x4200000000000000000000000000000000000006",
    uniswap: {
      v3: {
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        nftPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        tickLens: "0xbfd8137f7d1516D3ea5cA83523914859ec47F573",
      },
    },
  },

  // Polygon
  137: {
    chainId: 137,
    name: "polygon",
    displayName: "Polygon",
    rpcUrl: process.env.POLYGON_RPC_URL || defaultRpcUrls[137],
    blockExplorer: "https://polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    uniswap: {
      v3: {
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        nftPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        tickLens: "0xbfd8137f7d1516D3ea5cA83523914859ec47F573",
      },
    },
  },

  // Base
  8453: {
    chainId: 8453,
    name: "base",
    displayName: "Base",
    rpcUrl: process.env.BASE_RPC_URL || defaultRpcUrls[8453],
    blockExplorer: "https://basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    wrappedNative: "0x4200000000000000000000000000000000000006",
    uniswap: {
      v3: {
        factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
        nftPositionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
        tickLens: "0x0CdeE061c75D43c82520eD998C23ac2991c9ac6d",
      },
    },
  },

  // BNB Chain (BSC)
  56: {
    chainId: 56,
    name: "bsc",
    displayName: "BNB Chain",
    rpcUrl: process.env.BSC_RPC_URL || defaultRpcUrls[56],
    blockExplorer: "https://bscscan.com",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    uniswap: {
      v3: {
        factory: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
        quoterV2: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
        nftPositionManager: "0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613",
        tickLens: "0xD9270014D396281579760619CCf4c3af0501A47C",
      },
    },
  },
};

// Helper to get chain config by chain ID or name
export function getChainConfig(chainIdOrName: number | string): ChainConfig | undefined {
  if (typeof chainIdOrName === "number") {
    return chains[chainIdOrName];
  }
  const name = chainIdOrName.toLowerCase();
  return Object.values(chains).find(c => c.name === name || c.displayName.toLowerCase() === name);
}

// Get list of supported chain IDs
export function getSupportedChainIds(): number[] {
  return Object.keys(chains).map(Number);
}

// Default chain ID (Ethereum mainnet)
export const DEFAULT_CHAIN_ID = 1;

export default {
  ...config,

  appName,
  server: {
    port: parseInt(process.env.PORT || "8095", 10),
    host: process.env.HOST || "http://localhost:8095",
  },

  // Legacy: Ethereum RPC configuration (for backwards compatibility)
  ethRpcUrl: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",

  // Price range to query (percentage above/below current price)
  // Default 50% for comprehensive depth view; use ?range=20 for faster loading
  priceRangePercent: parseInt(process.env.PRICE_RANGE_PERCENT || "50", 10),

  // Cache TTL in seconds
  cacheTtl: parseInt(process.env.CACHE_TTL || "300", 10),

  // Chain configurations
  chains,
  defaultChainId: DEFAULT_CHAIN_ID,

  // Legacy Uniswap contract addresses (Ethereum mainnet) - for backwards compatibility
  uniswap: {
    v3: {
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
      quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
      nftPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    },
    v4: {
      poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
      positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
    },
  },

  // Supported chain IDs (derived from chains config)
  supportedChains: Object.fromEntries(
    Object.values(chains).map(c => [c.chainId, c.name])
  ),
};
