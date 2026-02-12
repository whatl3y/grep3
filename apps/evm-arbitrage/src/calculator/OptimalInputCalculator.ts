import Logger from "bunyan";
import { IDexAdapter } from "../types/dex";
import { ArbitragePath } from "../types/arbitrage";

interface OptimalInputCalculatorOptions {
  log: Logger;
  precision?: bigint;
  maxIterations?: number;
}

/**
 * Finds the optimal input amount to maximize arbitrage profit
 * Uses ternary search since profit function is generally unimodal
 */
export class OptimalInputCalculator {
  private log: Logger;
  private precision: bigint;
  private maxIterations: number;

  constructor(options: OptimalInputCalculatorOptions) {
    this.log = options.log.child({ component: "OptimalInputCalculator" });
    this.precision = options.precision || 10n ** 15n; // 0.001 ETH
    this.maxIterations = options.maxIterations || 100;
  }

  /**
   * Find optimal input using ternary search
   * Profit function is typically unimodal (increases then decreases)
   */
  findOptimalInput(
    path: ArbitragePath,
    adapters: Map<string, IDexAdapter>,
    minInput: bigint,
    maxInput: bigint,
    gasCostWei: bigint
  ): {
    optimalInput: bigint;
    expectedOutput: bigint;
    expectedProfit: bigint;
    iterations: number;
  } {
    let low = minInput;
    let high = maxInput;
    let iterations = 0;

    while (high - low > this.precision && iterations < this.maxIterations) {
      const mid1 = low + (high - low) / 3n;
      const mid2 = high - (high - low) / 3n;

      const profit1 = this.calculateProfit(path, mid1, adapters, gasCostWei);
      const profit2 = this.calculateProfit(path, mid2, adapters, gasCostWei);

      if (profit1 < profit2) {
        low = mid1;
      } else {
        high = mid2;
      }

      iterations++;
    }

    const optimalInput = (low + high) / 2n;
    const output = this.calculatePathOutput(path, optimalInput, adapters);
    const profit = output > optimalInput ? output - optimalInput - gasCostWei : 0n;

    return {
      optimalInput,
      expectedOutput: output,
      expectedProfit: profit,
      iterations,
    };
  }

  /**
   * Find optimal input using golden section search
   * More efficient than ternary search for smooth functions
   */
  findOptimalInputGoldenSection(
    path: ArbitragePath,
    adapters: Map<string, IDexAdapter>,
    minInput: bigint,
    maxInput: bigint,
    gasCostWei: bigint
  ): {
    optimalInput: bigint;
    expectedOutput: bigint;
    expectedProfit: bigint;
    iterations: number;
  } {
    const phi = 1618033988749895n; // Golden ratio * 10^15
    const scale = 10n ** 15n;

    let a = minInput;
    let b = maxInput;

    // Initial probe points
    let x1 = b - ((b - a) * phi) / (scale + phi);
    let x2 = a + ((b - a) * phi) / (scale + phi);

    let f1 = this.calculateProfit(path, x1, adapters, gasCostWei);
    let f2 = this.calculateProfit(path, x2, adapters, gasCostWei);

    let iterations = 0;

    while (b - a > this.precision && iterations < this.maxIterations) {
      if (f1 < f2) {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = a + ((b - a) * phi) / (scale + phi);
        f2 = this.calculateProfit(path, x2, adapters, gasCostWei);
      } else {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = b - ((b - a) * phi) / (scale + phi);
        f1 = this.calculateProfit(path, x1, adapters, gasCostWei);
      }

      iterations++;
    }

    const optimalInput = (a + b) / 2n;
    const output = this.calculatePathOutput(path, optimalInput, adapters);
    const profit = output > optimalInput ? output - optimalInput - gasCostWei : 0n;

    return {
      optimalInput,
      expectedOutput: output,
      expectedProfit: profit,
      iterations,
    };
  }

  /**
   * Calculate net profit for a given input
   */
  private calculateProfit(
    path: ArbitragePath,
    input: bigint,
    adapters: Map<string, IDexAdapter>,
    gasCostWei: bigint
  ): bigint {
    const output = this.calculatePathOutput(path, input, adapters);

    if (output <= input) {
      return -gasCostWei; // Negative profit
    }

    return output - input - gasCostWei;
  }

  /**
   * Calculate output for a path
   */
  private calculatePathOutput(
    path: ArbitragePath,
    input: bigint,
    adapters: Map<string, IDexAdapter>
  ): bigint {
    let current = input;

    for (const hop of path.hops) {
      const adapter = adapters.get(hop.pool.dexName);
      if (!adapter) return 0n;

      current = adapter.getAmountOut(hop.pool, current, hop.tokenIn);
      if (current === 0n) return 0n;
    }

    return current;
  }

  /**
   * Estimate maximum profitable input based on pool reserves
   */
  estimateMaxInput(path: ArbitragePath): bigint {
    let minReserve = BigInt(Number.MAX_SAFE_INTEGER);

    for (const hop of path.hops) {
      const pool = hop.pool;
      const isToken0 = hop.tokenIn.toLowerCase() === pool.token0.toLowerCase();
      const reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;

      // For V2 pools, use reserve
      if (reserveIn && reserveIn > 0n) {
        // Don't use more than 10% of reserve to avoid massive slippage
        const maxForPool = reserveIn / 10n;
        if (maxForPool < minReserve) {
          minReserve = maxForPool;
        }
      }

      // For V3 pools, estimate from liquidity
      if (pool.liquidity && pool.liquidity > 0n) {
        const maxForPool = pool.liquidity / 10n;
        if (maxForPool < minReserve) {
          minReserve = maxForPool;
        }
      }
    }

    // Default to 10 ETH if we can't estimate
    if (minReserve === BigInt(Number.MAX_SAFE_INTEGER)) {
      return 10n * 10n ** 18n;
    }

    return minReserve;
  }

  /**
   * Find multiple local optima (for multi-modal profit functions)
   */
  findLocalOptima(
    path: ArbitragePath,
    adapters: Map<string, IDexAdapter>,
    minInput: bigint,
    maxInput: bigint,
    gasCostWei: bigint,
    numSamples = 10
  ): Array<{
    input: bigint;
    profit: bigint;
  }> {
    const step = (maxInput - minInput) / BigInt(numSamples);
    const optima: Array<{ input: bigint; profit: bigint }> = [];

    let prevProfit = -1n;
    let increasing = true;

    for (let i = 0n; i <= BigInt(numSamples); i++) {
      const input = minInput + step * i;
      const profit = this.calculateProfit(path, input, adapters, gasCostWei);

      if (profit < prevProfit && increasing && prevProfit > 0n) {
        // Found a local maximum
        const result = this.findOptimalInput(
          path,
          adapters,
          input - step,
          input,
          gasCostWei
        );
        optima.push({
          input: result.optimalInput,
          profit: result.expectedProfit,
        });
      }

      increasing = profit >= prevProfit;
      prevProfit = profit;
    }

    return optima.sort((a, b) => Number(b.profit - a.profit));
  }
}
