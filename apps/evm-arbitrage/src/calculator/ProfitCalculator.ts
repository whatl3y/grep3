import Logger from "bunyan";
import { IDexAdapter } from "../types/dex";
import { ArbitragePath, ArbitrageOpportunity } from "../types/arbitrage";

interface ProfitCalculatorOptions {
  log: Logger;
}

/**
 * Calculates expected profit for arbitrage paths
 */
export class ProfitCalculator {
  private log: Logger;

  constructor(options: ProfitCalculatorOptions) {
    this.log = options.log.child({ component: "ProfitCalculator" });
  }

  /**
   * Calculate expected output for a path with given input
   */
  calculatePathOutput(
    path: ArbitragePath,
    inputAmount: bigint,
    adapters: Map<string, IDexAdapter>
  ): bigint {
    let currentAmount = inputAmount;

    for (const hop of path.hops) {
      const adapter = adapters.get(hop.pool.dexName);
      if (!adapter) {
        this.log.debug(
          { dexName: hop.pool.dexName },
          "Adapter not found for hop"
        );
        return 0n;
      }

      const output = adapter.getAmountOut(hop.pool, currentAmount, hop.tokenIn);
      if (output === 0n) {
        return 0n;
      }

      currentAmount = output;
    }

    return currentAmount;
  }

  /**
   * Calculate profit metrics for a path
   */
  calculateProfit(
    path: ArbitragePath,
    inputAmount: bigint,
    adapters: Map<string, IDexAdapter>
  ): {
    outputAmount: bigint;
    profit: bigint;
    profitBps: number;
    priceImpactBps: number;
  } {
    const outputAmount = this.calculatePathOutput(path, inputAmount, adapters);

    if (outputAmount === 0n || outputAmount <= inputAmount) {
      return {
        outputAmount,
        profit: 0n,
        profitBps: 0,
        priceImpactBps: 10000, // 100% price impact
      };
    }

    const profit = outputAmount - inputAmount;
    const profitBps = Number((profit * 10000n) / inputAmount);

    // Calculate total price impact across hops
    let totalImpactBps = 0;
    let currentAmount = inputAmount;

    for (const hop of path.hops) {
      const adapter = adapters.get(hop.pool.dexName);
      if (adapter) {
        const quote = adapter.getSwapQuote(hop.pool, currentAmount, hop.tokenIn);
        totalImpactBps += quote.priceImpactBps;
        currentAmount = quote.amountOut;
      }
    }

    return {
      outputAmount,
      profit,
      profitBps,
      priceImpactBps: totalImpactBps,
    };
  }

  /**
   * Evaluate a path and create an opportunity if profitable
   */
  evaluatePath(
    path: ArbitragePath,
    inputAmount: bigint,
    adapters: Map<string, IDexAdapter>,
    minProfitBps: number,
    gasCostWei: bigint
  ): ArbitrageOpportunity | null {
    const profitMetrics = this.calculateProfit(path, inputAmount, adapters);

    if (profitMetrics.profit <= gasCostWei) {
      return null;
    }

    const netProfit = profitMetrics.profit - gasCostWei;
    const netProfitBps = Number((netProfit * 10000n) / inputAmount);

    if (netProfitBps < minProfitBps) {
      return null;
    }

    return {
      chainId: path.chainId,
      path,
      inputAmount,
      expectedOutput: profitMetrics.outputAmount,
      expectedProfitWei: netProfit,
      expectedProfitBps: netProfitBps,
      priceImpactBps: profitMetrics.priceImpactBps,
      gasCostWei,
      timestamp: Date.now(),
    };
  }

  /**
   * Rank opportunities by profitability
   */
  rankOpportunities(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
    return opportunities.sort((a, b) => {
      // Primary: sort by profit in bps (higher is better)
      const profitDiff = b.expectedProfitBps - a.expectedProfitBps;
      if (profitDiff !== 0) return profitDiff;

      // Secondary: sort by absolute profit
      return Number(b.expectedProfitWei - a.expectedProfitWei);
    });
  }

  /**
   * Check if opportunity is still valid (reserves haven't changed significantly)
   */
  validateOpportunity(
    opportunity: ArbitrageOpportunity,
    adapters: Map<string, IDexAdapter>,
    maxSlippageBps: number
  ): boolean {
    const currentProfit = this.calculateProfit(
      opportunity.path,
      opportunity.inputAmount,
      adapters
    );

    if (currentProfit.outputAmount <= opportunity.inputAmount) {
      return false;
    }

    // Check if profit has degraded more than max slippage
    const profitChange =
      Number(
        ((opportunity.expectedProfitWei - currentProfit.profit) * 10000n) /
          opportunity.expectedProfitWei
      );

    return profitChange <= maxSlippageBps;
  }

  /**
   * Calculate break-even input amount (where profit = gas cost)
   */
  calculateBreakEvenInput(
    path: ArbitragePath,
    adapters: Map<string, IDexAdapter>,
    gasCostWei: bigint,
    maxInput: bigint
  ): bigint | null {
    // Binary search for break-even point
    let low = 0n;
    let high = maxInput;

    while (high - low > 1000n) {
      const mid = (low + high) / 2n;
      const profitMetrics = this.calculateProfit(path, mid, adapters);

      if (profitMetrics.profit < gasCostWei) {
        low = mid;
      } else {
        high = mid;
      }
    }

    // Verify the result is actually profitable
    const finalProfit = this.calculateProfit(path, high, adapters);
    if (finalProfit.profit > gasCostWei) {
      return high;
    }

    return null;
  }
}
