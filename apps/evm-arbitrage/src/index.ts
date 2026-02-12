import dotenv from "dotenv";
import log from "./logger";
import redis from "./redis";
import config from "./config";
import { ProviderFactory } from "./providers";
import { ArbitrageService } from "./services/ArbitrageService";

dotenv.config({ quiet: true } as any);

/**
 * Main entry point for the EVM Arbitrage Bot
 *
 * This daemon continuously:
 * 1. Scans liquidity pools across multiple DEXs and chains
 * 2. Identifies profitable arbitrage opportunities
 * 3. Executes arbitrage trades when profitable
 */
(async function main() {
  log.info({ appName: config.appName }, "Starting EVM Arbitrage Bot...");

  // Validate configuration
  if (!config.execution.privateKey && config.execution.enabled) {
    log.error("PRIVATE_KEY is required when execution is enabled");
    process.exit(1);
  }

  // Initialize provider factory
  const providerFactory = new ProviderFactory(config.execution.privateKey);

  // Create arbitrage service
  const arbitrageService = new ArbitrageService({
    log,
    redis,
    providerFactory,
  });

  // Start the service
  await arbitrageService.start();

  log.info(
    {
      chains: config.getSupportedChainIds(),
      executionEnabled: config.execution.enabled,
      minProfitWei: config.execution.minProfitWei.toString(),
    },
    "EVM Arbitrage Bot started successfully"
  );

  // Graceful shutdown handlers
  process.on("SIGINT", killProcess);
  process.on("SIGTERM", killProcess);

  async function killProcess() {
    log.info("Shutting down EVM Arbitrage Bot...");

    await arbitrageService.stop();
    await redis.quit();

    log.info("Shutdown complete");
    process.exit(0);
  }
})().catch((err) => {
  log.error({ err }, "Fatal error during startup");
  process.exit(1);
});
