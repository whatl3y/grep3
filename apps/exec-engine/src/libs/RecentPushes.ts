import IORedis from "ioredis";

export interface RecentPush {
  address: string;
  repo: string;
  branch: string;
  commit: string;
  timestamp: number;
}

const RECENT_PUSHES_KEY = "recent_pushes";
const MAX_RECENT_PUSHES = 100;

export default function RecentPushes(redis: IORedis) {
  return {
    /**
     * Add a new push event to the recent pushes list.
     * Keeps only the most recent MAX_RECENT_PUSHES entries.
     */
    async addPush(push: Omit<RecentPush, "timestamp">): Promise<void> {
      const entry: RecentPush = {
        ...push,
        timestamp: Date.now(),
      };
      // LPUSH adds to the front (most recent first)
      await redis.lpush(RECENT_PUSHES_KEY, JSON.stringify(entry));
      // LTRIM keeps only the first MAX_RECENT_PUSHES entries
      await redis.ltrim(RECENT_PUSHES_KEY, 0, MAX_RECENT_PUSHES - 1);
    },

    /**
     * Get recent pushes with pagination.
     * @param page - Page number (1-indexed)
     * @param pageSize - Number of items per page
     * @returns Object containing pushes array and total count
     */
    async getPushes(
      page: number = 1,
      pageSize: number = 10
    ): Promise<{ pushes: RecentPush[]; total: number; totalPages: number }> {
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      const [rawPushes, total] = await Promise.all([
        redis.lrange(RECENT_PUSHES_KEY, start, end),
        redis.llen(RECENT_PUSHES_KEY),
      ]);

      const pushes = rawPushes.map((raw) => JSON.parse(raw) as RecentPush);
      const totalPages = Math.ceil(total / pageSize);

      return { pushes, total, totalPages };
    },
  };
}
