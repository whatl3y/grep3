import { TokenGraph, TokenNode } from "./GraphBuilder";
import { PoolEdge, ArbitragePath } from "../types/arbitrage";
import { SupportedChainId } from "../config";

/**
 * Detects arbitrage cycles (paths that start and end at the same token)
 */
export class CycleDetector {
  private maxHops: number;

  constructor(maxHops = 3) {
    this.maxHops = maxHops;
  }

  /**
   * Find all arbitrage cycles starting from a base token
   * Uses DFS to find cycles of length 2 to maxHops
   */
  findCycles(
    graph: TokenGraph,
    chainId: SupportedChainId,
    baseToken: string
  ): ArbitragePath[] {
    const cycles: ArbitragePath[] = [];
    const startToken = baseToken.toLowerCase();

    const startNode = graph.nodes.get(startToken);
    if (!startNode) return cycles;

    // DFS to find all cycles
    this.dfs(
      graph,
      chainId,
      startToken,
      startToken,
      [],
      new Set<string>(),
      cycles
    );

    return cycles;
  }

  /**
   * Find 2-hop cycles (triangular arbitrage) from base token
   * Most common and efficient arbitrage pattern
   */
  findTwoHopCycles(
    graph: TokenGraph,
    chainId: SupportedChainId,
    baseToken: string
  ): ArbitragePath[] {
    const cycles: ArbitragePath[] = [];
    const startToken = baseToken.toLowerCase();

    const startNode = graph.nodes.get(startToken);
    if (!startNode) return cycles;

    // For each edge from base token
    for (const edge1 of startNode.edges) {
      const intermediateToken = edge1.tokenOut.toLowerCase();
      const intermediateNode = graph.nodes.get(intermediateToken);

      if (!intermediateNode) continue;

      // Find edges back to base token
      for (const edge2 of intermediateNode.edges) {
        if (edge2.tokenOut.toLowerCase() === startToken) {
          // Skip if using the same pool (would be a 0-profit loop)
          if (edge1.pool.address === edge2.pool.address) continue;

          cycles.push({
            chainId,
            startToken: baseToken,
            hops: [edge1, edge2],
          });
        }
      }
    }

    return cycles;
  }

  /**
   * Find 3-hop cycles from base token
   */
  findThreeHopCycles(
    graph: TokenGraph,
    chainId: SupportedChainId,
    baseToken: string
  ): ArbitragePath[] {
    const cycles: ArbitragePath[] = [];
    const startToken = baseToken.toLowerCase();

    const startNode = graph.nodes.get(startToken);
    if (!startNode) return cycles;

    // Track visited pools to avoid duplicates
    const visitedPaths = new Set<string>();

    for (const edge1 of startNode.edges) {
      const token1 = edge1.tokenOut.toLowerCase();
      if (token1 === startToken) continue;

      const node1 = graph.nodes.get(token1);
      if (!node1) continue;

      for (const edge2 of node1.edges) {
        const token2 = edge2.tokenOut.toLowerCase();
        if (token2 === startToken || token2 === token1) continue;
        if (edge2.pool.address === edge1.pool.address) continue;

        const node2 = graph.nodes.get(token2);
        if (!node2) continue;

        for (const edge3 of node2.edges) {
          if (edge3.tokenOut.toLowerCase() !== startToken) continue;
          if (
            edge3.pool.address === edge1.pool.address ||
            edge3.pool.address === edge2.pool.address
          )
            continue;

          // Create path key to deduplicate
          const pathKey = [
            edge1.pool.address,
            edge2.pool.address,
            edge3.pool.address,
          ]
            .sort()
            .join("-");

          if (visitedPaths.has(pathKey)) continue;
          visitedPaths.add(pathKey);

          cycles.push({
            chainId,
            startToken: baseToken,
            hops: [edge1, edge2, edge3],
          });
        }
      }
    }

    return cycles;
  }

  /**
   * DFS to find all cycles from start to target
   */
  private dfs(
    graph: TokenGraph,
    chainId: SupportedChainId,
    currentToken: string,
    targetToken: string,
    path: PoolEdge[],
    visitedPools: Set<string>,
    cycles: ArbitragePath[]
  ): void {
    // If we've reached max hops, stop
    if (path.length >= this.maxHops) return;

    const currentNode = graph.nodes.get(currentToken);
    if (!currentNode) return;

    for (const edge of currentNode.edges) {
      // Skip if we've already used this pool
      if (visitedPools.has(edge.pool.address)) continue;

      const nextToken = edge.tokenOut.toLowerCase();
      const newPath = [...path, edge];

      // If we've returned to target and path length >= 2, we found a cycle
      if (nextToken === targetToken && newPath.length >= 2) {
        cycles.push({
          chainId,
          startToken: targetToken,
          hops: newPath,
        });
        continue;
      }

      // Continue DFS
      visitedPools.add(edge.pool.address);
      this.dfs(graph, chainId, nextToken, targetToken, newPath, visitedPools, cycles);
      visitedPools.delete(edge.pool.address);
    }
  }

  /**
   * Sort cycles by estimated profitability (rough heuristic)
   * Cycles with larger liquidity pools are ranked higher
   */
  sortByLiquidity(cycles: ArbitragePath[]): ArbitragePath[] {
    return cycles.sort((a, b) => {
      const liquidityA = this.estimateLiquidity(a);
      const liquidityB = this.estimateLiquidity(b);
      return Number(liquidityB - liquidityA);
    });
  }

  /**
   * Estimate path liquidity using minimum pool liquidity
   */
  private estimateLiquidity(path: ArbitragePath): bigint {
    let minLiquidity = BigInt(Number.MAX_SAFE_INTEGER);

    for (const hop of path.hops) {
      const pool = hop.pool;

      // For V2-style pools, use geometric mean of reserves
      if (pool.reserve0 && pool.reserve1) {
        const liquidity = this.sqrt(pool.reserve0 * pool.reserve1);
        if (liquidity < minLiquidity) {
          minLiquidity = liquidity;
        }
      }

      // For V3-style pools, use liquidity field
      if (pool.liquidity && pool.liquidity < minLiquidity) {
        minLiquidity = pool.liquidity;
      }
    }

    return minLiquidity;
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
}
