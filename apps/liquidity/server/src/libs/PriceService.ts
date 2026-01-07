import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import config from "../config";
import log from "../logger";
import coinGeckoService, { OHLCData } from "./CoinGecko";

// Uniswap V3 Pool Swap event
const SWAP_EVENT_ABI = [
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
];

// Number of blocks to look back for swap events (roughly 2 hours on Ethereum)
const BLOCKS_TO_FETCH = 600;

// Max swap events to process
const MAX_SWAP_EVENTS = 500;

// Time bucket size for aggregating swaps into OHLC (5 minutes)
const OHLC_BUCKET_MS = 5 * 60 * 1000;

export interface PriceHistoryResult {
  prices: OHLCData[];
  baseToken: {
    address: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
    isStable: boolean;  // true if USD stablecoin
    isEth: boolean;     // true if WETH/ETH (acting as quote asset)
  };
  currentPriceUSD: number;
  source: "coingecko" | "onchain";
  isInverted: boolean;
}

export class PriceService {
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl?: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl || config.ethRpcUrl);
  }

  /**
   * Get price history - tries CoinGecko first, falls back to on-chain events
   */
  async getPriceHistory(
    poolAddress: string,
    token0Address: string,
    token0Symbol: string,
    token0Decimals: number,
    token1Address: string,
    token1Symbol: string,
    token1Decimals: number
  ): Promise<PriceHistoryResult | null> {
    // Get token ordering from CoinGecko service
    const { baseToken, quoteToken, isInverted } = coinGeckoService.getTokenOrdering(
      token0Address,
      token0Symbol,
      token1Address,
      token1Symbol
    );

    // Try CoinGecko first
    const coingeckoId = coinGeckoService.getCoingeckoId(baseToken.address);

    if (coingeckoId) {
      try {
        log.info(`Trying CoinGecko for ${baseToken.symbol} (${coingeckoId})`);
        const ohlcData = await coinGeckoService.getOHLC(coingeckoId, 30); // 30 days of history
        const currentPrice = await coinGeckoService.getCurrentPrice(coingeckoId);

        if (ohlcData.length > 0) {
          log.info(`Got ${ohlcData.length} price points from CoinGecko`);
          return {
            prices: ohlcData,
            baseToken,
            quoteToken: {
              ...quoteToken,
              isStable: coinGeckoService.isStablecoin(quoteToken.address),
              isEth: coinGeckoService.isEthToken(quoteToken.address),
            },
            currentPriceUSD: currentPrice,
            source: "coingecko",
            isInverted,
          };
        }
      } catch (error) {
        log.warn(`CoinGecko failed for ${baseToken.symbol}, trying on-chain fallback`);
      }
    }

    // Fallback to on-chain swap events
    log.info(`Fetching on-chain swap events for pool ${poolAddress}`);
    try {
      const prices = await this.getOnChainPriceHistory(
        poolAddress,
        token0Decimals,
        token1Decimals,
        isInverted
      );

      if (prices.length > 0) {
        const isQuoteEth = coinGeckoService.isEthToken(quoteToken.address);
        const isQuoteStable = coinGeckoService.isStablecoin(quoteToken.address);

        // If the quote token is WETH/ETH, convert prices to USD
        let finalPrices = prices;
        let currentPriceUSD = prices[prices.length - 1].close;

        if (isQuoteEth && !isQuoteStable) {
          // Get ETH/USD price to convert
          try {
            const ethPriceUSD = await coinGeckoService.getCurrentPrice("ethereum");
            if (ethPriceUSD > 0) {
              log.info(`Converting on-chain prices from ETH to USD (ETH = $${ethPriceUSD})`);
              // Convert all OHLC prices from ETH to USD
              finalPrices = prices.map(p => ({
                timestamp: p.timestamp,
                open: p.open * ethPriceUSD,
                high: p.high * ethPriceUSD,
                low: p.low * ethPriceUSD,
                close: p.close * ethPriceUSD,
              }));
              currentPriceUSD = finalPrices[finalPrices.length - 1].close;
            }
          } catch (err) {
            log.warn("Failed to get ETH/USD price for conversion, using raw ETH prices");
          }
        }

        return {
          prices: finalPrices,
          baseToken,
          quoteToken: {
            ...quoteToken,
            isStable: isQuoteStable,
            isEth: isQuoteEth,
          },
          currentPriceUSD,
          source: "onchain",
          isInverted,
        };
      }
    } catch (error) {
      log.error("Failed to get on-chain price history:", error);
    }

    return null;
  }

  /**
   * Fetch swap events from the pool and convert to OHLC data
   */
  private async getOnChainPriceHistory(
    poolAddress: string,
    token0Decimals: number,
    token1Decimals: number,
    isInverted: boolean
  ): Promise<OHLCData[]> {
    const pool = new ethers.Contract(poolAddress, SWAP_EVENT_ABI, this.provider);

    // Get current block
    const currentBlock = await this.provider.getBlockNumber();
    const fromBlock = currentBlock - BLOCKS_TO_FETCH;

    log.info(`Fetching swap events from block ${fromBlock} to ${currentBlock}`);

    // Fetch swap events
    const filter = pool.filters.Swap();
    const events = await pool.queryFilter(filter, fromBlock, currentBlock);

    log.info(`Found ${events.length} swap events`);

    if (events.length === 0) {
      return [];
    }

    // Limit events to process
    const eventsToProcess = events.slice(-MAX_SWAP_EVENTS);

    // Convert events to price points with timestamps
    const pricePoints: { timestamp: number; price: number }[] = [];

    for (const event of eventsToProcess) {
      try {
        const block = await event.getBlock();
        if (!block) continue;

        const log = event as ethers.EventLog;
        const sqrtPriceX96 = log.args[4]; // sqrtPriceX96

        // Calculate price from sqrtPriceX96
        const sqrtPrice = new BigNumber(sqrtPriceX96.toString()).dividedBy(
          new BigNumber(2).pow(96)
        );
        let price = sqrtPrice.pow(2);

        // Adjust for decimals
        const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
        price = price.multipliedBy(decimalAdjustment);

        // Invert if needed (to show price as base/quote)
        if (isInverted) {
          price = new BigNumber(1).dividedBy(price);
        }

        pricePoints.push({
          timestamp: block.timestamp * 1000, // Convert to milliseconds
          price: price.toNumber(),
        });
      } catch (err) {
        // Skip events we can't process
        continue;
      }
    }

    if (pricePoints.length === 0) {
      return [];
    }

    // Sort by timestamp
    pricePoints.sort((a, b) => a.timestamp - b.timestamp);

    // Aggregate into OHLC buckets
    return this.aggregateToOHLC(pricePoints);
  }

  /**
   * Aggregate price points into OHLC data
   */
  private aggregateToOHLC(pricePoints: { timestamp: number; price: number }[]): OHLCData[] {
    if (pricePoints.length === 0) return [];

    const buckets = new Map<number, { prices: number[] }>();

    // Group prices into time buckets
    for (const point of pricePoints) {
      const bucketTime = Math.floor(point.timestamp / OHLC_BUCKET_MS) * OHLC_BUCKET_MS;

      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, { prices: [] });
      }
      buckets.get(bucketTime)!.prices.push(point.price);
    }

    // Convert buckets to OHLC
    const ohlcData: OHLCData[] = [];

    const sortedBuckets = Array.from(buckets.entries()).sort(([a], [b]) => a - b);

    for (const [timestamp, { prices }] of sortedBuckets) {
      if (prices.length === 0) continue;

      ohlcData.push({
        timestamp,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
      });
    }

    return ohlcData;
  }
}

export default PriceService;
