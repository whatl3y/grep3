import IORedis from "ioredis";

export interface RecentPush {
  address: string;
  repo: string;
  branch: string;
  commit: string;
  timestamp: number;
}

const RECENT_PUSHES_KEY = "recent_pushes";
const RECENT_PUSHES_DATA_KEY = "recent_pushes_data";
const MAX_RECENT_PUSHES = 100;

export default function RecentPushes(redis: IORedis) {
  return {
    /**
     * Add a new push event to the recent pushes list.
     * Deduplicates by address+repo - only keeps the latest push per repo.
     * Uses a sorted set with timestamp as score for ordering.
     */
    async addPush(push: Omit<RecentPush, "timestamp">): Promise<void> {
      const timestamp = Date.now();
      const entry: RecentPush = {
        ...push,
        timestamp,
      };

      // Create a unique key for this address+repo combination
      const repoKey = `${push.address}:${push.repo}`;

      // Use a pipeline to atomically:
      // 1. Add/update the repo in the sorted set (score = timestamp for ordering)
      // 2. Store the full push data in a hash
      // 3. Trim to keep only MAX_RECENT_PUSHES entries
      const pipeline = redis.pipeline();

      // ZADD with the timestamp as score - this naturally deduplicates by repoKey
      // Higher timestamp = more recent, so we use timestamp directly
      pipeline.zadd(RECENT_PUSHES_KEY, timestamp, repoKey);

      // Store the full push data in a hash
      pipeline.hset(RECENT_PUSHES_DATA_KEY, repoKey, JSON.stringify(entry));

      // Get the current count to check if we need to trim
      pipeline.zcard(RECENT_PUSHES_KEY);

      const results = await pipeline.exec();
      const count = results?.[2]?.[1] as number;

      // If we have more than MAX_RECENT_PUSHES, remove the oldest entries
      if (count > MAX_RECENT_PUSHES) {
        const toRemove = count - MAX_RECENT_PUSHES;
        // Get the oldest entries (lowest scores)
        const oldestKeys = await redis.zrange(
          RECENT_PUSHES_KEY,
          0,
          toRemove - 1
        );

        if (oldestKeys.length > 0) {
          const pipeline2 = redis.pipeline();
          // Remove from sorted set
          pipeline2.zremrangebyrank(RECENT_PUSHES_KEY, 0, toRemove - 1);
          // Remove from hash
          pipeline2.hdel(RECENT_PUSHES_DATA_KEY, ...oldestKeys);
          await pipeline2.exec();
        }
      }
    },

    /**
     * Get recent pushes with pagination.
     * Returns unique repos only (latest push per repo), ordered by most recent.
     * @param page - Page number (1-indexed)
     * @param pageSize - Number of items per page
     * @returns Object containing pushes array and pagination info
     */
    async getPushes(
      page: number = 1,
      pageSize: number = 10
    ): Promise<{ pushes: RecentPush[]; total: number; totalPages: number }> {
      // Get total count
      const total = await redis.zcard(RECENT_PUSHES_KEY);

      if (total === 0) {
        return { pushes: [], total: 0, totalPages: 0 };
      }

      // Calculate pagination offsets (reversed since we want newest first)
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      // ZREVRANGE returns highest scores first (most recent timestamps)
      const repoKeys = await redis.zrevrange(RECENT_PUSHES_KEY, start, end);

      if (repoKeys.length === 0) {
        return { pushes: [], total, totalPages: Math.ceil(total / pageSize) };
      }

      // Get the full push data for each key
      const rawPushes = await redis.hmget(RECENT_PUSHES_DATA_KEY, ...repoKeys);

      const pushes = rawPushes
        .filter((raw): raw is string => raw !== null)
        .map((raw) => JSON.parse(raw) as RecentPush);

      const totalPages = Math.ceil(total / pageSize);

      return { pushes, total, totalPages };
    },
  };
}
