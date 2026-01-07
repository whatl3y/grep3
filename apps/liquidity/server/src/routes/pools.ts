import { Request, Response } from "express";
import { ethers } from "ethers";
import { IRoute } from "./index";
import { LiquidityService, isV3Address, isV4PoolId } from "../libs/LiquidityService";
import config, { chains, getChainConfig, getSupportedChainIds } from "../config";
import log from "../logger";

const liquidityService = new LiquidityService();

// GET /api/chains - Get list of supported chains
export const getChains: IRoute = {
  method: "get",
  path: "/api/chains",
  handler(_req: Request, res: Response) {
    const supportedChains = Object.values(chains).map(c => ({
      chainId: c.chainId,
      name: c.name,
      displayName: c.displayName,
      blockExplorer: c.blockExplorer,
      nativeCurrency: c.nativeCurrency,
    }));
    res.json({
      success: true,
      data: supportedChains,
    });
  },
};

// GET /api/pool/:address - Get liquidity distribution for a V3 pool
// Query params:
//   - range: price range percentage (default 20)
//   - chain: chain ID or name (default: auto-detect, falls back to ethereum)
//   - auto: set to "true" to enable auto-detection across all chains
export const getPoolLiquidity: IRoute = {
  method: "get",
  path: "/api/pool/:address",
  async handler(req: Request, res: Response) {
    try {
      const { address } = req.params;
      const priceRangePercent = req.query.range
        ? parseInt(req.query.range as string, 10)
        : undefined;

      // Parse chain parameter (can be chain ID or name)
      let chainId: number | undefined;
      if (req.query.chain) {
        const chainParam = req.query.chain as string;
        const chainConfig = getChainConfig(
          /^\d+$/.test(chainParam) ? parseInt(chainParam, 10) : chainParam
        );
        if (chainConfig) {
          chainId = chainConfig.chainId;
        } else {
          res.status(400).json({
            success: false,
            error: `Invalid chain: ${chainParam}. Supported chains: ${getSupportedChainIds().join(", ")}`,
          });
          return;
        }
      }

      // Check if auto-detection is requested
      const autoDetect = req.query.auto === "true";

      if (!ethers.isAddress(address)) {
        res.status(400).json({
          success: false,
          error: "Invalid pool address format",
        });
        return;
      }

      const data = await liquidityService.getPoolLiquidity(
        address,
        priceRangePercent,
        undefined, // onProgress not used for REST API
        chainId,
        autoDetect
      );

      res.json({
        success: true,
        data,
      });
    } catch (err: any) {
      log.error("Error fetching pool liquidity:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/pool/:address/detect - Detect which chain a pool is on
export const detectPoolChain: IRoute = {
  method: "get",
  path: "/api/pool/:address/detect",
  async handler(req: Request, res: Response) {
    try {
      const { address } = req.params;

      if (!ethers.isAddress(address)) {
        res.status(400).json({
          success: false,
          error: "Invalid pool address format",
        });
        return;
      }

      const chainId = await liquidityService.detectPoolChain(address);

      if (chainId) {
        const chainConfig = chains[chainId];
        res.json({
          success: true,
          data: {
            chainId,
            name: chainConfig.name,
            displayName: chainConfig.displayName,
          },
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Pool ${address} not found on any supported chain`,
          supportedChains: getSupportedChainIds(),
        });
      }
    } catch (err: any) {
      log.error("Error detecting pool chain:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// POST /api/v4/pool - Get liquidity distribution for a V4 pool using pool key
export const getV4PoolLiquidity: IRoute = {
  method: "post",
  path: "/api/v4/pool",
  async handler(req: Request, res: Response) {
    try {
      const { currency0, currency1, fee, tickSpacing, hooks, range } = req.body;

      if (!currency0 || !currency1) {
        res.status(400).json({
          success: false,
          error: "currency0 and currency1 are required",
        });
        return;
      }

      if (!ethers.isAddress(currency0) || !ethers.isAddress(currency1)) {
        res.status(400).json({
          success: false,
          error: "Invalid currency address format",
        });
        return;
      }

      const poolKey = {
        currency0,
        currency1,
        fee: fee || 3000,
        tickSpacing: tickSpacing || 60,
        hooks: hooks || ethers.ZeroAddress,
      };

      const data = await liquidityService.getV4PoolLiquidity(poolKey, range);

      res.json({
        success: true,
        data,
        poolId: liquidityService.computeV4PoolId(poolKey),
      });
    } catch (err: any) {
      log.error("Error fetching V4 pool liquidity:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/v4/pool/:name - Get liquidity for a known V4 pool by name
export const getV4PoolByName: IRoute = {
  method: "get",
  path: "/api/v4/pool/:name",
  async handler(req: Request, res: Response) {
    try {
      const { name } = req.params;
      const priceRangePercent = req.query.range
        ? parseInt(req.query.range as string, 10)
        : undefined;

      const data = await liquidityService.getV4PoolByName(name, priceRangePercent);

      res.json({
        success: true,
        data,
      });
    } catch (err: any) {
      log.error("Error fetching V4 pool by name:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/v4/pools - List known V4 pools
export const listV4Pools: IRoute = {
  method: "get",
  path: "/api/v4/pools",
  handler(_req: Request, res: Response) {
    const pools = liquidityService.getKnownV4Pools();
    res.json({
      success: true,
      data: pools,
    });
  },
};

// GET /api/v4/pool-id/:poolId - Get V4 pool liquidity by pool ID only (looks up pool key from events)
export const getV4PoolById: IRoute = {
  method: "get",
  path: "/api/v4/pool-id/:poolId",
  async handler(req: Request, res: Response) {
    try {
      const { poolId } = req.params;
      const priceRangePercent = req.query.range
        ? parseInt(req.query.range as string, 10)
        : undefined;

      if (!isV4PoolId(poolId)) {
        res.status(400).json({
          success: false,
          error: "Invalid pool ID format. Expected 0x + 64 hex characters (bytes32)",
        });
        return;
      }

      // Get liquidity data - pool key will be looked up from on-chain events
      const data = await liquidityService.getV4PoolLiquidityById(
        poolId,
        undefined, // No pool key provided - will be looked up
        priceRangePercent
      );

      res.json({
        success: true,
        data,
        poolId,
      });
    } catch (err: any) {
      log.error("Error fetching V4 pool by ID:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/v4/pool-id/:poolId/validate - Check if a V4 pool ID is valid
export const validateV4PoolId: IRoute = {
  method: "get",
  path: "/api/v4/pool-id/:poolId/validate",
  async handler(req: Request, res: Response) {
    try {
      const { poolId } = req.params;

      if (!isV4PoolId(poolId)) {
        res.status(400).json({
          success: false,
          error: "Invalid pool ID format. Expected 0x + 64 hex characters (bytes32)",
        });
        return;
      }

      const isValid = await liquidityService.isValidV4PoolId(poolId);
      const basicInfo = isValid ? await liquidityService.getV4PoolBasicInfo(poolId) : null;

      res.json({
        success: true,
        data: {
          poolId,
          isValid,
          basicInfo,
        },
      });
    } catch (err: any) {
      log.error("Error validating V4 pool ID:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/v4/pool-id/:poolId/key - Look up pool key from pool ID
export const getV4PoolKey: IRoute = {
  method: "get",
  path: "/api/v4/pool-id/:poolId/key",
  async handler(req: Request, res: Response) {
    try {
      const { poolId } = req.params;

      if (!isV4PoolId(poolId)) {
        res.status(400).json({
          success: false,
          error: "Invalid pool ID format. Expected 0x + 64 hex characters (bytes32)",
        });
        return;
      }

      const poolKey = await liquidityService.getV4PoolKeyFromId(poolId);

      if (!poolKey) {
        res.status(404).json({
          success: false,
          error: `Could not find pool key for pool ID ${poolId}. The pool may not exist or has not been initialized.`,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          poolId,
          poolKey,
        },
      });
    } catch (err: any) {
      log.error("Error looking up V4 pool key:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// POST /api/v4/pool-id/:poolId/with-key - Get V4 pool liquidity by pool ID + pool key (faster if you have the key)
export const getV4PoolByIdWithKey: IRoute = {
  method: "post",
  path: "/api/v4/pool-id/:poolId/with-key",
  async handler(req: Request, res: Response) {
    try {
      const { poolId } = req.params;
      const { currency0, currency1, fee, tickSpacing, hooks, range } = req.body;

      if (!isV4PoolId(poolId)) {
        res.status(400).json({
          success: false,
          error: "Invalid pool ID format. Expected 0x + 64 hex characters (bytes32)",
        });
        return;
      }

      if (!currency0 || !currency1) {
        res.status(400).json({
          success: false,
          error: "currency0 and currency1 are required in the request body",
        });
        return;
      }

      if (!ethers.isAddress(currency0) || !ethers.isAddress(currency1)) {
        res.status(400).json({
          success: false,
          error: "Invalid currency address format",
        });
        return;
      }

      const poolKey = {
        currency0,
        currency1,
        fee: fee || 3000,
        tickSpacing: tickSpacing || 60,
        hooks: hooks || ethers.ZeroAddress,
      };

      const data = await liquidityService.getV4PoolLiquidityById(
        poolId,
        poolKey,
        range
      );

      res.json({
        success: true,
        data,
        poolId,
      });
    } catch (err: any) {
      log.error("Error fetching V4 pool by ID:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/identify/:value - Identify if a value is a V3 address or V4 pool ID
export const identifyPoolValue: IRoute = {
  method: "get",
  path: "/api/identify/:value",
  async handler(req: Request, res: Response) {
    try {
      const { value } = req.params;
      const type = liquidityService.getPoolIdentifierType(value);

      let isValid = false;
      let details: Record<string, unknown> = {};

      if (type === "v3_address") {
        // Check across all chains
        const chainId = await liquidityService.detectPoolChain(value);
        isValid = chainId !== null;
        if (isValid) {
          details = {
            chainId,
            chainName: chains[chainId!].displayName,
          };
        }
      } else if (type === "v4_pool_id") {
        isValid = await liquidityService.isValidV4PoolId(value);
        if (isValid) {
          const basicInfo = await liquidityService.getV4PoolBasicInfo(value);
          details = { basicInfo };
        }
      }

      res.json({
        success: true,
        data: {
          value,
          type,
          isValid,
          ...details,
        },
      });
    } catch (err: any) {
      log.error("Error identifying pool value:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// POST /api/v4/compute-id - Compute pool ID from pool key
export const computeV4PoolId: IRoute = {
  method: "post",
  path: "/api/v4/compute-id",
  handler(req: Request, res: Response) {
    try {
      const { currency0, currency1, fee, tickSpacing, hooks } = req.body;

      if (!currency0 || !currency1) {
        res.status(400).json({
          success: false,
          error: "currency0 and currency1 are required",
        });
        return;
      }

      const poolKey = {
        currency0,
        currency1,
        fee: fee || 3000,
        tickSpacing: tickSpacing || 60,
        hooks: hooks || ethers.ZeroAddress,
      };

      const poolId = liquidityService.computeV4PoolId(poolKey);

      res.json({
        success: true,
        data: {
          poolId,
          poolKey,
        },
      });
    } catch (err: any) {
      log.error("Error computing V4 pool ID:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/pool/:address/info - Get basic pool info without liquidity distribution
export const getPoolInfo: IRoute = {
  method: "get",
  path: "/api/pool/:address/info",
  async handler(req: Request, res: Response) {
    try {
      const { address } = req.params;

      if (!ethers.isAddress(address)) {
        res.status(400).json({
          success: false,
          error: "Invalid pool address format",
        });
        return;
      }

      // Just get pool info without full liquidity distribution
      const data = await liquidityService.getPoolLiquidity(address);

      res.json({
        success: true,
        data: {
          pool: data.pool,
          priceRange: data.priceRange,
          totalLiquidityUSD: data.totalLiquidityUSD,
          timestamp: data.timestamp,
        },
      });
    } catch (err: any) {
      log.error("Error fetching pool info:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// POST /api/pool/:address/invalidate - Invalidate cache for a pool
export const invalidatePoolCache: IRoute = {
  method: "post",
  path: "/api/pool/:address/invalidate",
  async handler(req: Request, res: Response) {
    try {
      const { address } = req.params;

      await liquidityService.invalidateCache(address);

      res.json({
        success: true,
        message: `Cache invalidated for pool ${address}`,
      });
    } catch (err: any) {
      log.error("Error invalidating cache:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
};

// GET /api/config - Get current configuration
export const getConfig: IRoute = {
  method: "get",
  path: "/api/config",
  handler(_req: Request, res: Response) {
    res.json({
      success: true,
      data: {
        priceRangePercent: config.priceRangePercent,
        cacheTtl: config.cacheTtl,
        supportedChains: config.supportedChains,
        uniswap: {
          v3: {
            factory: config.uniswap.v3.factory,
          },
          v4: {
            poolManager: config.uniswap.v4.poolManager,
          },
        },
      },
    });
  },
};
