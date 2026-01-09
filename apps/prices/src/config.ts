import { config } from "@grep3/core";

const appName = process.env.APP_NAME || "@grep3/prices";

// DEX types supported
export type DexType = "uniswap_v4" | "uniswap_v3" | "uniswap_v2" | "algebra" | "solidly" | "curve" | "traderjoe_lb";

export interface DexConfig {
  name: string;
  type: DexType;
  factory: string;
  // For V3/Algebra style DEXs
  quoter?: string;
  // For V4 style DEXs (singleton PoolManager)
  poolManager?: string;
  // Fee tiers for V3 style (basis points)
  feeTiers?: number[];
}

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
  stablecoins: string[];
  dexes: DexConfig[];
}

// Default public RPC URLs
const defaultRpcUrls: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
  42161: "https://arb1.arbitrum.io/rpc",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  137: "https://polygon-rpc.com",
};

// Chain priority order for EVM lookups
export const CHAIN_PRIORITY = [1, 8453, 56, 42161, 43114, 137];

// Standard Uniswap V3 fee tiers
const UNISWAP_V3_FEES = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

// Algebra fee tiers (dynamic fees, but common values)
const ALGEBRA_FEES = [100, 500, 3000, 10000];

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
    stablecoins: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
    ],
    dexes: [
      {
        name: "Uniswap V4",
        type: "uniswap_v4",
        factory: "0x000000000004444c5dc75cB358380D2e3dE08A90", // PoolManager
        poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
        quoter: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
      },
      {
        name: "Uniswap V3",
        type: "uniswap_v3",
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        feeTiers: UNISWAP_V3_FEES,
      },
      {
        name: "Uniswap V2",
        type: "uniswap_v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      },
      {
        name: "SushiSwap V3",
        type: "uniswap_v3",
        factory: "0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4F",
        feeTiers: UNISWAP_V3_FEES,
      },
      {
        name: "SushiSwap V2",
        type: "uniswap_v2",
        factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
      },
    ],
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
    stablecoins: [
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
      "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // USDbC
    ],
    dexes: [
      {
        name: "Uniswap V4",
        type: "uniswap_v4",
        factory: "0x498581ff718922c3f8e6a244956af099b2652b2b", // PoolManager
        poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
        quoter: "0x0d5e0f971ed27fbff6c2837bf31316121532048d",
      },
      {
        name: "Uniswap V3",
        type: "uniswap_v3",
        factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
        feeTiers: UNISWAP_V3_FEES,
      },
      {
        name: "Aerodrome SlipStream",
        type: "algebra",
        factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A", // CL Factory
        quoter: "0x254cF9E1E6E233aa1AC962CB9B05b2cfeaae15b0",
        feeTiers: [100, 200, 500, 3000, 10000],
      },
      {
        name: "Aerodrome V2",
        type: "solidly",
        factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
      },
      {
        name: "BaseSwap V3",
        type: "uniswap_v3",
        factory: "0x38015D05f4fEC8AFe15D7cc0386a126574e8077B",
        feeTiers: UNISWAP_V3_FEES,
      },
    ],
  },

  // BNB Chain
  56: {
    chainId: 56,
    name: "bsc",
    displayName: "BNB Chain",
    rpcUrl: process.env.BSC_RPC_URL || defaultRpcUrls[56],
    blockExplorer: "https://bscscan.com",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    stablecoins: [
      "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
      "0x55d398326f99059fF775485246999027B3197955", // USDT
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
    ],
    dexes: [
      {
        name: "Uniswap V4",
        type: "uniswap_v4",
        factory: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df", // PoolManager
        poolManager: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
        quoter: "0x9f75dd27d6664c475b90e105573e550ff69437b0",
      },
      {
        name: "PancakeSwap V3",
        type: "uniswap_v3",
        factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
        quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
        feeTiers: [100, 500, 2500, 10000],
      },
      {
        name: "PancakeSwap V2",
        type: "uniswap_v2",
        factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
      },
      {
        name: "Uniswap V3",
        type: "uniswap_v3",
        factory: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
        quoter: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
        feeTiers: UNISWAP_V3_FEES,
      },
    ],
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
    stablecoins: [
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
      "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", // DAI
    ],
    dexes: [
      {
        name: "Uniswap V4",
        type: "uniswap_v4",
        factory: "0x360e68faccca8ca495c1b759fd9eee466db9fb32", // PoolManager
        poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
        quoter: "0x3972c00f7ed4885e145823eb7c655375d275a1c5",
      },
      {
        name: "Uniswap V3",
        type: "uniswap_v3",
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        feeTiers: UNISWAP_V3_FEES,
      },
      {
        name: "Camelot V3",
        type: "algebra",
        factory: "0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B",
        feeTiers: ALGEBRA_FEES,
      },
      {
        name: "Camelot V2",
        type: "uniswap_v2",
        factory: "0x6EcCab422D763aC031210895C81787E87B43A652",
      },
      {
        name: "SushiSwap V3",
        type: "uniswap_v3",
        factory: "0x1af415a1EBa07a4986a52B6f2e7dE7003D82231e",
        feeTiers: UNISWAP_V3_FEES,
      },
    ],
  },

  // Avalanche C-Chain
  43114: {
    chainId: 43114,
    name: "avalanche",
    displayName: "Avalanche",
    rpcUrl: process.env.AVALANCHE_RPC_URL || defaultRpcUrls[43114],
    blockExplorer: "https://snowtrace.io",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    wrappedNative: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    stablecoins: [
      "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC
      "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", // USDT
      "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", // DAI.e
    ],
    dexes: [
      {
        name: "Uniswap V4",
        type: "uniswap_v4",
        factory: "0x06380c0e0912312b5150364b9dc4542ba0dbbc85", // PoolManager
        poolManager: "0x06380c0e0912312b5150364b9dc4542ba0dbbc85",
        quoter: "0xbe40675bb704506a3c2ccfb762dcfd1e979845c2",
      },
      {
        name: "Trader Joe LB V2.1",
        type: "traderjoe_lb",
        factory: "0x8e42f2F4101563bF679975178e880FD87d3eFd4e",
        quoter: "0xd76019A16606FDa4651f636D9751f500Ed776250",
      },
      {
        name: "Uniswap V3",
        type: "uniswap_v3",
        factory: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
        quoter: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
        feeTiers: UNISWAP_V3_FEES,
      },
      {
        name: "Trader Joe V1",
        type: "uniswap_v2",
        factory: "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10",
      },
      {
        name: "Pangolin",
        type: "uniswap_v2",
        factory: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88",
      },
    ],
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
    stablecoins: [
      "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
      "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI
    ],
    dexes: [
      {
        name: "Uniswap V4",
        type: "uniswap_v4",
        factory: "0x67366782805870060151383f4bbff9dab53e5cd6", // PoolManager
        poolManager: "0x67366782805870060151383f4bbff9dab53e5cd6",
        quoter: "0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9",
      },
      {
        name: "Uniswap V3",
        type: "uniswap_v3",
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        feeTiers: UNISWAP_V3_FEES,
      },
      {
        name: "QuickSwap V3",
        type: "algebra",
        factory: "0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28",
        feeTiers: ALGEBRA_FEES,
      },
      {
        name: "QuickSwap V2",
        type: "uniswap_v2",
        factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
      },
      {
        name: "SushiSwap",
        type: "uniswap_v2",
        factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
      },
    ],
  },
};

// Solana configuration
export const solana = {
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  wrappedSolMint: "So11111111111111111111111111111111111111112",
};

// Helper to get chain config by chain ID
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return chains[chainId];
}

export default {
  ...config,

  appName,

  server: {
    host: process.env.HOST || "http://localhost:8097",
    port: parseInt(process.env.PORT || "8097", 10),
  },

  // CoinGecko settings
  // Demo API: free tier with x-cg-demo-api-key header
  // Pro API: paid tier with different base URL and x-cg-pro-api-key header
  coingecko: {
    enabled: process.env.COINGECKO_ENABLED !== "false",
    apiKey: process.env.COINGECKO_API_KEY,
    isPro: process.env.COINGECKO_PRO === "true",
    baseUrl:
      process.env.COINGECKO_PRO === "true"
        ? "https://pro-api.coingecko.com/api/v3"
        : "https://api.coingecko.com/api/v3",
  },

  // CoinMarketCap settings
  coinmarketcap: {
    enabled: process.env.CMC_ENABLED === "true",
    apiKey: process.env.CMC_API_KEY,
    baseUrl: "https://pro-api.coinmarketcap.com/v2",
  },

  // Jupiter settings (Solana)
  jupiter: {
    enabled: process.env.JUPITER_ENABLED !== "false",
    apiKey: process.env.JUPITER_API_KEY,
    quoteUrl: "https://api.jup.ag/quote/v6",
    priceUrl: "https://api.jup.ag/price/v2",
  },

  // Cache settings
  cache: {
    enabled: process.env.CACHE_ENABLED !== "false",
    ttlSeconds: parseInt(process.env.CACHE_TTL || "60", 10),
  },

  // Chain configurations
  chains,
  chainPriority: CHAIN_PRIORITY,
  solana,
};
