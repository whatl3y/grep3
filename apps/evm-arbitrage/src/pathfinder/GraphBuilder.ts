import { PoolInfo } from "../types/dex";
import { PoolEdge } from "../types/arbitrage";

/**
 * Token node in the graph
 */
export interface TokenNode {
  address: string;
  edges: PoolEdge[];
}

/**
 * Graph structure representing token connections through pools
 */
export interface TokenGraph {
  nodes: Map<string, TokenNode>;
  edgeCount: number;
}

/**
 * Builds a graph of tokens connected by liquidity pools
 */
export class GraphBuilder {
  /**
   * Build a token graph from pools
   * Each pool creates bidirectional edges between its tokens
   */
  buildGraph(pools: PoolInfo[]): TokenGraph {
    const nodes = new Map<string, TokenNode>();
    let edgeCount = 0;

    for (const pool of pools) {
      const token0 = pool.token0.toLowerCase();
      const token1 = pool.token1.toLowerCase();

      // Ensure nodes exist
      if (!nodes.has(token0)) {
        nodes.set(token0, { address: token0, edges: [] });
      }
      if (!nodes.has(token1)) {
        nodes.set(token1, { address: token1, edges: [] });
      }

      // Create bidirectional edges
      const edge0to1: PoolEdge = {
        pool,
        tokenIn: pool.token0,
        tokenOut: pool.token1,
      };
      const edge1to0: PoolEdge = {
        pool,
        tokenIn: pool.token1,
        tokenOut: pool.token0,
      };

      nodes.get(token0)!.edges.push(edge0to1);
      nodes.get(token1)!.edges.push(edge1to0);
      edgeCount += 2;
    }

    return { nodes, edgeCount };
  }

  /**
   * Build a subgraph containing only pools with specified tokens
   */
  buildSubgraph(pools: PoolInfo[], tokens: string[]): TokenGraph {
    const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));

    const filteredPools = pools.filter((pool) => {
      const token0 = pool.token0.toLowerCase();
      const token1 = pool.token1.toLowerCase();
      return tokenSet.has(token0) && tokenSet.has(token1);
    });

    return this.buildGraph(filteredPools);
  }

  /**
   * Get all tokens reachable from a starting token within N hops
   */
  getReachableTokens(
    graph: TokenGraph,
    startToken: string,
    maxHops: number
  ): Set<string> {
    const reachable = new Set<string>();
    const start = startToken.toLowerCase();

    if (!graph.nodes.has(start)) {
      return reachable;
    }

    const queue: Array<{ token: string; hops: number }> = [
      { token: start, hops: 0 },
    ];
    const visited = new Set<string>();
    visited.add(start);

    while (queue.length > 0) {
      const { token, hops } = queue.shift()!;
      reachable.add(token);

      if (hops < maxHops) {
        const node = graph.nodes.get(token);
        if (node) {
          for (const edge of node.edges) {
            const nextToken = edge.tokenOut.toLowerCase();
            if (!visited.has(nextToken)) {
              visited.add(nextToken);
              queue.push({ token: nextToken, hops: hops + 1 });
            }
          }
        }
      }
    }

    return reachable;
  }

  /**
   * Get edges between two tokens
   */
  getEdgesBetween(
    graph: TokenGraph,
    tokenA: string,
    tokenB: string
  ): PoolEdge[] {
    const nodeA = graph.nodes.get(tokenA.toLowerCase());
    if (!nodeA) return [];

    return nodeA.edges.filter(
      (edge) => edge.tokenOut.toLowerCase() === tokenB.toLowerCase()
    );
  }

  /**
   * Get all neighbors of a token
   */
  getNeighbors(graph: TokenGraph, token: string): string[] {
    const node = graph.nodes.get(token.toLowerCase());
    if (!node) return [];

    const neighbors = new Set<string>();
    for (const edge of node.edges) {
      neighbors.add(edge.tokenOut.toLowerCase());
    }
    return Array.from(neighbors);
  }

  /**
   * Get statistics about the graph
   */
  getStats(graph: TokenGraph): {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    maxDegree: number;
  } {
    let maxDegree = 0;
    let totalDegree = 0;

    for (const node of graph.nodes.values()) {
      const degree = node.edges.length;
      totalDegree += degree;
      if (degree > maxDegree) {
        maxDegree = degree;
      }
    }

    const nodeCount = graph.nodes.size;
    const avgDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;

    return {
      nodeCount,
      edgeCount: graph.edgeCount,
      avgDegree,
      maxDegree,
    };
  }

  /**
   * Find the most liquid pool edge from a token to WETH
   * Uses geometric mean of reserves for V2 pools, liquidity for V3 pools
   * @param graph The token graph
   * @param fromToken The source token
   * @param weth The WETH address
   * @returns The most liquid edge to WETH, or null if none exists
   */
  findMostLiquidWethEdge(
    graph: TokenGraph,
    fromToken: string,
    weth: string
  ): PoolEdge | null {
    const edges = this.getEdgesBetween(graph, fromToken, weth);

    if (edges.length === 0) return null;

    // Sort edges by liquidity (descending)
    const sortedEdges = edges.sort((a, b) => {
      const liqA = this.estimateEdgeLiquidity(a);
      const liqB = this.estimateEdgeLiquidity(b);
      return Number(liqB - liqA);
    });

    return sortedEdges[0];
  }

  /**
   * Find all edges from a token to WETH, sorted by liquidity
   */
  findWethEdges(
    graph: TokenGraph,
    fromToken: string,
    weth: string
  ): PoolEdge[] {
    const edges = this.getEdgesBetween(graph, fromToken, weth);

    return edges.sort((a, b) => {
      const liqA = this.estimateEdgeLiquidity(a);
      const liqB = this.estimateEdgeLiquidity(b);
      return Number(liqB - liqA);
    });
  }

  /**
   * Estimate liquidity for an edge
   */
  private estimateEdgeLiquidity(edge: PoolEdge): bigint {
    const pool = edge.pool;

    // For V2-style pools, use geometric mean of reserves
    if (pool.reserve0 && pool.reserve1) {
      return this.sqrt(pool.reserve0 * pool.reserve1);
    }

    // For V3-style pools, use liquidity field
    if (pool.liquidity) {
      return pool.liquidity;
    }

    return 0n;
  }

  /**
   * Integer square root for liquidity calculation
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
