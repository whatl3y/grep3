import Logger from "bunyan";
import Redis from "ioredis";
import { JsonRpcProvider, Wallet } from "ethers";
import { SupportedChainId } from "../config";

interface NonceManagerOptions {
  log: Logger;
  redis: Redis;
  provider: JsonRpcProvider;
  wallet: Wallet;
  chainId: SupportedChainId;
}

/**
 * Manages transaction nonces to avoid conflicts
 * Tracks pending transactions and handles nonce gaps
 */
export class NonceManager {
  private log: Logger;
  private redis: Redis;
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private chainId: SupportedChainId;
  private address: string;

  // Local nonce tracking
  private localNonce: number = -1;
  private pendingNonces: Set<number> = new Set();

  constructor(options: NonceManagerOptions) {
    this.log = options.log.child({ component: "NonceManager" });
    this.redis = options.redis;
    this.provider = options.provider;
    this.wallet = options.wallet;
    this.chainId = options.chainId;
    this.address = this.wallet.address.toLowerCase();
  }

  /**
   * Get the next available nonce
   */
  async getNextNonce(): Promise<number> {
    // Get nonce from network
    const networkNonce = await this.provider.getTransactionCount(
      this.address,
      "pending"
    );

    // Get cached nonce
    const cacheKey = this.getCacheKey();
    const cachedNonce = await this.redis.get(cacheKey);

    // Use the higher of network nonce or cached nonce
    let nextNonce = networkNonce;
    if (cachedNonce !== null) {
      const cached = parseInt(cachedNonce, 10);
      if (cached >= networkNonce) {
        nextNonce = cached + 1;
      }
    }

    // Track locally
    if (this.localNonce >= nextNonce) {
      nextNonce = this.localNonce + 1;
    }

    this.localNonce = nextNonce;
    this.pendingNonces.add(nextNonce);

    // Update cache
    await this.redis.set(cacheKey, nextNonce.toString(), "EX", 300); // 5 min TTL

    this.log.debug(
      { chainId: this.chainId, nonce: nextNonce, networkNonce },
      "Got next nonce"
    );

    return nextNonce;
  }

  /**
   * Confirm a nonce has been used (transaction submitted)
   */
  async confirmNonce(nonce: number): Promise<void> {
    this.pendingNonces.delete(nonce);

    const cacheKey = this.getCacheKey();
    const cached = await this.redis.get(cacheKey);

    if (cached === null || parseInt(cached, 10) < nonce) {
      await this.redis.set(cacheKey, nonce.toString(), "EX", 300);
    }
  }

  /**
   * Release a nonce that wasn't used (transaction failed to submit)
   */
  releaseNonce(nonce: number): void {
    this.pendingNonces.delete(nonce);

    // If this was our highest local nonce, decrement
    if (nonce === this.localNonce) {
      this.localNonce--;
    }
  }

  /**
   * Reset nonce tracking (e.g., after errors)
   */
  async reset(): Promise<void> {
    this.localNonce = -1;
    this.pendingNonces.clear();

    const cacheKey = this.getCacheKey();
    await this.redis.del(cacheKey);

    this.log.info({ chainId: this.chainId }, "Nonce manager reset");
  }

  /**
   * Sync with network nonce
   */
  async sync(): Promise<number> {
    const networkNonce = await this.provider.getTransactionCount(
      this.address,
      "pending"
    );

    this.localNonce = networkNonce - 1;

    const cacheKey = this.getCacheKey();
    await this.redis.set(cacheKey, (networkNonce - 1).toString(), "EX", 300);

    this.log.debug(
      { chainId: this.chainId, networkNonce },
      "Synced with network nonce"
    );

    return networkNonce;
  }

  /**
   * Check for nonce gaps and fill them
   */
  async checkAndFillGaps(): Promise<number[]> {
    const networkNonce = await this.provider.getTransactionCount(
      this.address,
      "latest"
    );
    const pendingNonce = await this.provider.getTransactionCount(
      this.address,
      "pending"
    );

    const gaps: number[] = [];

    // If pending > latest, there are pending transactions
    if (pendingNonce > networkNonce) {
      // Check for gaps in pending nonces
      for (let i = networkNonce; i < pendingNonce; i++) {
        if (!this.pendingNonces.has(i)) {
          gaps.push(i);
        }
      }
    }

    if (gaps.length > 0) {
      this.log.warn(
        { chainId: this.chainId, gaps, networkNonce, pendingNonce },
        "Found nonce gaps"
      );
    }

    return gaps;
  }

  /**
   * Get current nonce status
   */
  async getStatus(): Promise<{
    networkNonce: number;
    pendingNonce: number;
    localNonce: number;
    pendingCount: number;
  }> {
    const networkNonce = await this.provider.getTransactionCount(
      this.address,
      "latest"
    );
    const pendingNonce = await this.provider.getTransactionCount(
      this.address,
      "pending"
    );

    return {
      networkNonce,
      pendingNonce,
      localNonce: this.localNonce,
      pendingCount: this.pendingNonces.size,
    };
  }

  private getCacheKey(): string {
    return `arb:nonce:${this.chainId}:${this.address}`;
  }
}
