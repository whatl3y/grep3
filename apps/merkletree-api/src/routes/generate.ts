import { Router } from "express";
import { Queue } from "node-resque";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { parse } from "csv-parse";
import { IFactoryOptions, Aws, createMerkleTree } from "@grep3/core";
import config from "../config";

const upload = multer({ storage: multer.memoryStorage() });

export default function GenerateRoutes({ db, log, redis }: IFactoryOptions): Router {
  const router = Router();
  const aws = Aws();
  const queue = new Queue({ connection: { redis } });

  // POST /generate/raw - Generate merkle tree from raw data
  router.post("/raw", async (req, res) => {
    try {
      const { data } = req.body;

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({
          error: "Invalid data format: expected non-empty array of arrays",
        });
      }

      // Validate that all rows are arrays
      for (const row of data) {
        if (!Array.isArray(row) || row.length === 0) {
          return res.status(400).json({
            error: "Invalid data format: each row must be a non-empty array",
          });
        }
      }

      const jobUuid = uuidv4();

      // Upload data to S3
      const s3Key = `merkletrees/data_${jobUuid}.json`;
      await aws.writeFile({
        filename: s3Key,
        data: Buffer.from(JSON.stringify(data)),
        exactFilename: true,
      });

      log.info(`Uploaded data to S3: ${s3Key} for job ${jobUuid}`);

      await queue.connect();
      await queue.enqueue(config.resque.default, "processMerkleTree", [
        { jobUuid, s3Key },
      ]);
      await queue.end();

      log.info(`Queued merkle tree processing job: ${jobUuid}`);

      // Create initial merkletree record in database
      await createMerkleTree({
        root_hash: "",
        job_uuid: jobUuid,
        job_status: "created",
        job_status_info: null,
      });

      // Set initial job status in Redis
      await redis.set(
        `merkletree:job:${jobUuid}`,
        JSON.stringify({ status: "created" }),
        "EX",
        86400 // 24 hour expiry
      );

      res.json({ job_uuid: jobUuid });
    } catch (error: any) {
      log.error("Error in /generate/raw:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // POST /generate/file - Generate merkle tree from CSV/spreadsheet file
  router.post("/file", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileBuffer = req.file.buffer;
      const fileContent = fileBuffer.toString("utf-8");

      // Parse CSV
      const records: string[][] = await new Promise((resolve, reject) => {
        parse(fileContent, { relax_column_count: true }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });

      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({
          error: "Invalid file format: no data found in file",
        });
      }

      log.info(`Parsed CSV with ${records.length} rows`);

      const jobUuid = uuidv4();

      // Upload data to S3
      const s3Key = `merkletrees/data_${jobUuid}.json`;
      await aws.writeFile({
        filename: s3Key,
        data: Buffer.from(JSON.stringify(records)),
        exactFilename: true,
      });

      log.info(`Uploaded data to S3: ${s3Key} for job ${jobUuid}`);

      await queue.connect();
      await queue.enqueue(config.resque.default, "processMerkleTree", [
        { jobUuid, s3Key },
      ]);
      await queue.end();

      log.info(`Queued merkle tree processing job: ${jobUuid}`);

      // Create initial merkletree record in database
      await createMerkleTree({
        root_hash: "",
        job_uuid: jobUuid,
        job_status: "created",
        job_status_info: null,
      });

      // Set initial job status in Redis
      await redis.set(
        `merkletree:job:${jobUuid}`,
        JSON.stringify({ status: "created" }),
        "EX",
        86400 // 24 hour expiry
      );

      res.json({ job_uuid: jobUuid });
    } catch (error: any) {
      log.error("Error in /generate/file:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  return router;
}
