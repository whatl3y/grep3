import { Router } from "express";
import { IFactoryOptions } from "@grep3/core";

export default function StatusRoutes({ db, log, redis }: IFactoryOptions): Router {
  const router = Router();

  // GET /status/:uuid - Check merkle tree job status
  router.get("/:uuid", async (req, res) => {
    try {
      const { uuid } = req.params;

      // Check Redis first
      const redisStatus = await redis.get(`merkletree:job:${uuid}`);

      if (redisStatus) {
        const statusData = JSON.parse(redisStatus);
        return res.json(statusData);
      }

      // If not in Redis, check database
      const dbRecord = await db
        .selectFrom("merkletrees")
        .select(["job_status", "root_hash", "job_status_info"])
        .where("job_uuid", "=", uuid)
        .executeTakeFirst();

      if (dbRecord) {
        return res.json({
          status: dbRecord.job_status,
          root_hash: dbRecord.root_hash || null,
          error: dbRecord.job_status_info || undefined,
        });
      }

      // Not found in Redis or DB
      res.json({
        status: "not_found",
        message:
          "Job not found. It may have completed and been removed from the cache, or it never existed.",
      });
    } catch (error: any) {
      log.error("Error in /status/:uuid:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  return router;
}
