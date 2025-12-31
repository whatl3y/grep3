import { Router } from "express";
import { IFactoryOptions } from "@grep3/core";

export default function ProofRoutes({ db, log, redis }: IFactoryOptions): Router {
  const router = Router();

  // GET /proof/:root_hash/:unique_id - Get proof for a specific leaf
  router.get("/:root_hash/:unique_id", async (req, res) => {
    try {
      const { root_hash, unique_id } = req.params;

      log.info(
        `Fetching proof for root_hash: ${root_hash}, unique_id: ${unique_id}`
      );

      // Query the database
      const result = await db
        .selectFrom("merkletrees")
        .innerJoin(
          "merkletree_values",
          "merkletrees.id",
          "merkletree_values.merkletree_id"
        )
        .select([
          "merkletrees.root_hash",
          "merkletree_values.unique_id",
          "merkletree_values.values",
          "merkletree_values.proof",
        ])
        .where("merkletrees.root_hash", "=", root_hash)
        .where("merkletree_values.unique_id", "=", unique_id)
        .executeTakeFirst();

      if (!result) {
        return res.status(404).json({
          error: "Proof not found for the given root_hash and unique_id",
        });
      }

      // Parse JSON fields
      const values = JSON.parse(result.values);
      const proof = JSON.parse(result.proof);

      res.json({
        root_hash: result.root_hash,
        unique_id: result.unique_id,
        values,
        proof,
      });
    } catch (error: any) {
      log.error("Error in /proof/:root_hash/:unique_id:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  return router;
}
