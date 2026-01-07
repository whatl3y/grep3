import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Markdown from "@grep3/core/dist/libs/Markdown";
import config from "./config";
import log from "./logger";
import bindRoutes from "./routes";
import redis from "./redis";
import { LiquidityService, isV3Address, isV4PoolId } from "./libs/LiquidityService";
import { ethers } from "ethers";

dotenv.config({ quiet: true });

// Socket event types
interface ServerToClientEvents {
  progress: (data: {
    phase: string;
    percent: number;
    message: string;
    currentBatch?: number;
    totalBatches?: number;
  }) => void;
  data: (data: { success: true; data: unknown }) => void;
  error: (data: { success: false; error: string }) => void;
}

interface ClientToServerEvents {
  "fetch:v3": (data: {
    poolAddress: string;
    priceRange?: number;
    chainId?: number;
    autoDetect?: boolean;
  }) => void;
  "fetch:v4": (data: {
    poolKey?: {
      currency0: string;
      currency1: string;
      fee: number;
      tickSpacing: number;
      hooks: string;
    };
    poolId?: string;
    poolName?: string;
    priceRange?: number;
  }) => void;
  "detect:chain": (data: { poolAddress: string }) => void;
  "identify": (data: { value: string }) => void;
  "validate:v4": (data: { poolId: string }) => void;
}

(async function webServer() {
  try {
    // Connect to Redis
    log.info("Connecting to Redis...");
    try {
      await redis.connect();
    } catch (err: any) {
      log.warn("Redis connection failed, caching will be disabled:", err.message);
    }

    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);

    // Create HTTP server
    const server = http.createServer(app);

    // Create Socket.IO server
    const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Bind API routes
    bindRoutes(app);

    // Present README on home page
    app.get("/", async (_, res) => {
      try {
        res.send(
          await Markdown.convertFileToHtml(
            path.join(__dirname, "..", "README.md")
          )
        );
      } catch (err: any) {
        res.status(500).send(err.stack);
      }
    });

    // Socket.IO connection handler
    io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
      log.info(`Client connected: ${socket.id}`);

      // Create a new LiquidityService instance for this connection
      const liquidityService = new LiquidityService();

      // Handle chain detection
      socket.on("detect:chain", async ({ poolAddress }) => {
        log.info(`[${socket.id}] Detecting chain for pool: ${poolAddress}`);

        try {
          if (!ethers.isAddress(poolAddress)) {
            socket.emit("error", {
              success: false,
              error: "Invalid pool address format",
            });
            return;
          }

          socket.emit("progress", {
            phase: "detecting",
            percent: 0,
            message: "Detecting pool chain...",
          });

          const chainId = await liquidityService.detectPoolChain(
            poolAddress,
            (progress) => socket.emit("progress", progress)
          );

          if (chainId) {
            socket.emit("data", {
              success: true,
              data: { chainId },
            });
          } else {
            socket.emit("error", {
              success: false,
              error: "Pool not found on any supported chain",
            });
          }
        } catch (err: any) {
          log.error(`[${socket.id}] Error detecting chain:`, err);
          socket.emit("error", {
            success: false,
            error: err.message,
          });
        }
      });

      // Handle V3 pool liquidity fetch
      socket.on("fetch:v3", async ({ poolAddress, priceRange, chainId, autoDetect }) => {
        log.info(`[${socket.id}] Fetching V3 pool: ${poolAddress} (chain: ${chainId || "auto"}, autoDetect: ${autoDetect})`);

        try {
          // Validate address
          if (!ethers.isAddress(poolAddress)) {
            socket.emit("error", {
              success: false,
              error: "Invalid pool address format",
            });
            return;
          }

          // Emit initial progress
          socket.emit("progress", {
            phase: "starting",
            percent: 0,
            message: "Starting liquidity fetch...",
          });

          // Fetch with progress callback
          const data = await liquidityService.getPoolLiquidity(
            poolAddress,
            priceRange,
            (progress) => {
              socket.emit("progress", progress);
            },
            chainId,
            autoDetect ?? false
          );

          // Emit final data
          socket.emit("data", {
            success: true,
            data,
          });
        } catch (err: any) {
          log.error(`[${socket.id}] Error fetching V3 pool:`, err);
          socket.emit("error", {
            success: false,
            error: err.message,
          });
        }
      });

      // Handle V4 pool liquidity fetch
      socket.on("fetch:v4", async ({ poolKey, poolId, poolName, priceRange }) => {
        log.info(`[${socket.id}] Fetching V4 pool: ${poolName || poolId || JSON.stringify(poolKey)}`);

        try {
          // Emit initial progress
          socket.emit("progress", {
            phase: "starting",
            percent: 0,
            message: "Starting V4 liquidity fetch...",
          });

          let data;

          if (poolName) {
            // Fetch by known pool name
            data = await liquidityService.getV4PoolByName(
              poolName,
              priceRange,
              (progress) => {
                socket.emit("progress", progress);
              }
            );
          } else if (poolId) {
            // Fetch by pool ID (with or without pool key)
            if (!isV4PoolId(poolId)) {
              socket.emit("error", {
                success: false,
                error: "Invalid pool ID format. Expected 0x + 64 hex characters (bytes32)",
              });
              return;
            }

            // If pool key is provided, validate addresses
            if (poolKey) {
              if (!ethers.isAddress(poolKey.currency0) || !ethers.isAddress(poolKey.currency1)) {
                socket.emit("error", {
                  success: false,
                  error: "Invalid currency address format",
                });
                return;
              }
            }

            // Pool key is optional - will be looked up from events if not provided
            data = await liquidityService.getV4PoolLiquidityById(
              poolId,
              poolKey, // Can be undefined - will look up from on-chain events
              priceRange,
              (progress) => {
                socket.emit("progress", progress);
              }
            );
          } else if (poolKey) {
            // Validate addresses
            if (!ethers.isAddress(poolKey.currency0) || !ethers.isAddress(poolKey.currency1)) {
              socket.emit("error", {
                success: false,
                error: "Invalid currency address format",
              });
              return;
            }

            // Fetch by pool key
            data = await liquidityService.getV4PoolLiquidity(
              poolKey,
              priceRange,
              (progress) => {
                socket.emit("progress", progress);
              }
            );
          } else {
            socket.emit("error", {
              success: false,
              error: "Either poolKey, poolId+poolKey, or poolName must be provided",
            });
            return;
          }

          // Emit final data
          socket.emit("data", {
            success: true,
            data,
          });
        } catch (err: any) {
          log.error(`[${socket.id}] Error fetching V4 pool:`, err);
          socket.emit("error", {
            success: false,
            error: err.message,
          });
        }
      });

      // Handle pool identifier identification (V3 address vs V4 pool ID)
      socket.on("identify", async ({ value }) => {
        log.info(`[${socket.id}] Identifying pool value: ${value}`);

        try {
          const type = liquidityService.getPoolIdentifierType(value);

          socket.emit("progress", {
            phase: "identifying",
            percent: 10,
            message: `Detected ${type === "v3_address" ? "V3 address" : type === "v4_pool_id" ? "V4 pool ID" : "unknown format"}...`,
          });

          let isValid = false;
          let details: Record<string, unknown> = {};

          if (type === "v3_address") {
            const chainId = await liquidityService.detectPoolChain(value, (progress) => {
              socket.emit("progress", progress);
            });
            isValid = chainId !== null;
            if (isValid) {
              details = { chainId, type: "v3" };
            }
          } else if (type === "v4_pool_id") {
            isValid = await liquidityService.isValidV4PoolId(value);
            if (isValid) {
              const basicInfo = await liquidityService.getV4PoolBasicInfo(value);
              details = { basicInfo, type: "v4" };
            }
          }

          socket.emit("data", {
            success: true,
            data: {
              value,
              identifierType: type,
              isValid,
              ...details,
            },
          });
        } catch (err: any) {
          log.error(`[${socket.id}] Error identifying value:`, err);
          socket.emit("error", {
            success: false,
            error: err.message,
          });
        }
      });

      // Handle V4 pool ID validation
      socket.on("validate:v4", async ({ poolId }) => {
        log.info(`[${socket.id}] Validating V4 pool ID: ${poolId}`);

        try {
          if (!isV4PoolId(poolId)) {
            socket.emit("error", {
              success: false,
              error: "Invalid pool ID format. Expected 0x + 64 hex characters (bytes32)",
            });
            return;
          }

          socket.emit("progress", {
            phase: "validating",
            percent: 10,
            message: "Checking V4 pool on-chain...",
          });

          const isValid = await liquidityService.isValidV4PoolId(poolId);
          const basicInfo = isValid ? await liquidityService.getV4PoolBasicInfo(poolId) : null;

          socket.emit("data", {
            success: true,
            data: {
              poolId,
              isValid,
              basicInfo,
            },
          });
        } catch (err: any) {
          log.error(`[${socket.id}] Error validating V4 pool:`, err);
          socket.emit("error", {
            success: false,
            error: err.message,
          });
        }
      });

      socket.on("disconnect", () => {
        log.info(`Client disconnected: ${socket.id}`);
      });
    });

    server.listen(config.server.port, () =>
      log.info(`Liquidity API listening on *:${config.server.port}`)
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
