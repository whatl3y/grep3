import Logger from "bunyan";
import { SupportedChainId } from "../config";
import { PoolInfo } from "../types/dex";
import { ArbitragePath } from "../types/arbitrage";
import { GraphBuilder, TokenGraph } from "./GraphBuilder";
import { CycleDetector } from "./CycleDetector";

interface PathFinderOptions {
  log: Logger;
  maxHops?: number;
  maxPathsPerToken?: number;
  wethAddress?: string; // WETH address for final swap conversion
}

/**
 * Orchestrates pathfinding to discover arbitrage opportunities
 */
export class PathFinder {
  private log: Logger;
  private graphBuilder: GraphBuilder;
  private cycleDetector: CycleDetector;
  private maxHops: number;
  private maxPathsPerToken: number;
  private wethAddress?: string;

  constructor(options: PathFinderOptions) {
    this.log = options.log.child({ component: "PathFinder" });
    this.maxHops = options.maxHops || 3;
    this.maxPathsPerToken = options.maxPathsPerToken || 100;
    this.wethAddress = options.wethAddress?.toLowerCase();
    this.graphBuilder = new GraphBuilder();
    this.cycleDetector = new CycleDetector(this.maxHops);
  }

  /**
   * Set the WETH address for a specific chain
   */
  setWethAddress(wethAddress: string): void {
    this.wethAddress = wethAddress.toLowerCase();
  }

  /**
   * Find all arbitrage paths starting from base tokens
   */
  findArbitragePaths(
    chainId: SupportedChainId,
    pools: PoolInfo[],
    baseTokens: string[]
  ): ArbitragePath[] {
    const startTime = Date.now();

    // Build the token graph
    const graph = this.graphBuilder.buildGraph(pools);
    const stats = this.graphBuilder.getStats(graph);

    this.log.debug(
      {
        chainId,
        poolCount: pools.length,
        nodeCount: stats.nodeCount,
        edgeCount: stats.edgeCount,
        avgDegree: stats.avgDegree.toFixed(2),
      },
      "Built token graph"
    );

    // Find cycles for each base token
    const allPaths: ArbitragePath[] = [];

    for (const baseToken of baseTokens) {
      const paths = this.findPathsFromToken(graph, chainId, baseToken);
      allPaths.push(...paths);
    }

    // Deduplicate paths (same pools in different order)
    const uniquePaths = this.deduplicatePaths(allPaths);

    // Sort by estimated liquidity
    const sortedPaths = this.cycleDetector.sortByLiquidity(uniquePaths);

    const elapsed = Date.now() - startTime;
    this.log.info(
      {
        chainId,
        baseTokenCount: baseTokens.length,
        totalPaths: sortedPaths.length,
        elapsedMs: elapsed,
      },
      "Pathfinding completed"
    );

    return sortedPaths;
  }

  /**
   * Find arbitrage paths from a specific base token
   */
  private findPathsFromToken(
    graph: TokenGraph,
    chainId: SupportedChainId,
    baseToken: string
  ): ArbitragePath[] {
    const paths: ArbitragePath[] = [];

    // Find 2-hop cycles (most common/profitable)
    const twoHopPaths = this.cycleDetector.findTwoHopCycles(
      graph,
      chainId,
      baseToken
    );
    paths.push(...twoHopPaths);

    // Find 3-hop cycles if we have capacity
    if (paths.length < this.maxPathsPerToken) {
      const threeHopPaths = this.cycleDetector.findThreeHopCycles(
        graph,
        chainId,
        baseToken
      );
      const remaining = this.maxPathsPerToken - paths.length;
      paths.push(...threeHopPaths.slice(0, remaining));
    }

    this.log.debug(
      {
        chainId,
        baseToken,
        twoHopPaths: twoHopPaths.length,
        totalPaths: paths.length,
      },
      "Found paths from token"
    );

    return paths;
  }

  /**
   * Deduplicate paths that use the same pools
   */
  private deduplicatePaths(paths: ArbitragePath[]): ArbitragePath[] {
    const seen = new Set<string>();
    const unique: ArbitragePath[] = [];

    for (const path of paths) {
      // Create a key from sorted pool addresses
      const poolAddresses = path.hops.map((h) => h.pool.address.toLowerCase());
      const key = poolAddresses.sort().join("-");

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(path);
      }
    }

    return unique;
  }

  /**
   * Filter paths to only include those with sufficient liquidity
   */
  filterByLiquidity(
    paths: ArbitragePath[],
    minLiquidityWei: bigint
  ): ArbitragePath[] {
    return paths.filter((path) => {
      for (const hop of path.hops) {
        const pool = hop.pool;

        // Check V2-style liquidity
        if (pool.reserve0 && pool.reserve1) {
          const liquidity = this.sqrt(pool.reserve0 * pool.reserve1);
          if (liquidity < minLiquidityWei) return false;
        }

        // Check V3-style liquidity
        if (pool.liquidity !== undefined && pool.liquidity < minLiquidityWei) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Get path summary for logging
   */
  getPathSummary(path: ArbitragePath): string {
    const tokens = [path.startToken];
    for (const hop of path.hops) {
      tokens.push(hop.tokenOut);
    }
    const dexes = path.hops.map((h) => h.pool.dexName);
    return `${tokens.join(" -> ")} via [${dexes.join(", ")}]`;
  }

  /**
   * Integer square root
   */
  private sqrt(n: bigint): bigint {
    if (n < 0n) return 0n;
    if (n === 0n) return 0n;

    let x = n;
    let y = (x + 1n) / 2n;

    while (y < x) {
      x = y;
      y = (x + n / x) / 2n;
    }

    return x;
  }

  /**
   * Ensure all paths end in WETH by appending the most liquid WETH swap if needed
   * @param paths The arbitrage paths to process
   * @param pools All available pools (for finding WETH pools)
   * @returns Paths that end in WETH (either originally or with appended swap)
   */
  ensurePathsEndInWeth(
    paths: ArbitragePath[],
    pools: PoolInfo[]
  ): ArbitragePath[] {
    if (!this.wethAddress) {
      this.log.warn("WETH address not set, cannot ensure paths end in WETH");
      return paths;
    }

    const graph = this.graphBuilder.buildGraph(pools);
    const result: ArbitragePath[] = [];

    for (const path of paths) {
      const lastHop = path.hops[path.hops.length - 1];
      const finalToken = lastHop.tokenOut.toLowerCase();

      // If already ends in WETH, keep as-is
      if (finalToken === this.wethAddress) {
        result.push(path);
        continue;
      }

      // Find the most liquid pool from final token to WETH
      const wethEdge = this.graphBuilder.findMostLiquidWethEdge(
        graph,
        finalToken,
        this.wethAddress
      );

      if (wethEdge) {
        // Append the WETH swap to the path
        const newPath: ArbitragePath = {
          ...path,
          hops: [...path.hops, wethEdge],
        };
        result.push(newPath);

        this.log.debug(
          {
            originalEnd: finalToken,
            wethPool: wethEdge.pool.address,
            dex: wethEdge.pool.dexName,
          },
          "Appended WETH swap to path"
        );
      } else {
        this.log.debug(
          {
            token: finalToken,
          },
          "No WETH pool found for token, dropping path"
        );
      }
    }

    return result;
  }

  /**
   * Find the most liquid pool edge from a token to WETH
   * Useful for adding a final conversion step to non-WETH-ending paths
   */
  findMostLiquidWethPool(
    pools: PoolInfo[],
    fromToken: string
  ): PoolInfo | null {
    if (!this.wethAddress) {
      return null;
    }

    const graph = this.graphBuilder.buildGraph(pools);
    const edge = this.graphBuilder.findMostLiquidWethEdge(
      graph,
      fromToken,
      this.wethAddress
    );

    return edge?.pool || null;
  }

  /**
   * Find arbitrage paths with automatic WETH conversion at the end
   * This method finds all paths and ensures they end in WETH for proper profit calculation
   */
  findArbitragePathsWithWethConversion(
    chainId: SupportedChainId,
    pools: PoolInfo[],
    baseTokens: string[],
    wethAddress: string
  ): ArbitragePath[] {
    // Set WETH address
    this.wethAddress = wethAddress.toLowerCase();

    // Find all paths
    const paths = this.findArbitragePaths(chainId, pools, baseTokens);

    // Ensure all paths end in WETH
    const wethPaths = this.ensurePathsEndInWeth(paths, pools);

    this.log.info(
      {
        chainId,
        originalPaths: paths.length,
        wethPaths: wethPaths.length,
      },
      "Converted paths to end in WETH"
    );

    return wethPaths;
  }

  /**
   * Get all available WETH pools for a specific token, sorted by liquidity
   * Useful for showing options or selecting alternative pools
   */
  getWethPoolsForToken(
    pools: PoolInfo[],
    token: string
  ): PoolInfo[] {
    if (!this.wethAddress) {
      return [];
    }

    const graph = this.graphBuilder.buildGraph(pools);
    const edges = this.graphBuilder.findWethEdges(
      graph,
      token,
      this.wethAddress
    );

    return edges.map((e) => e.pool);
  }

  /**
   * Get the GraphBuilder instance for direct access
   */
  getGraphBuilder(): GraphBuilder {
    return this.graphBuilder;
  }
}
