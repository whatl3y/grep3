import { Readable } from "stream";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import {
  IFactoryOptions,
  Aws,
  updateMerkleTreeByJobUuid,
  createMerkleTreeValues,
  upsertMerkleTree,
  findMerkleTreeByJobUuid,
} from "@grep3/core";
// import config from "../config";

interface MerkleTreeJobArgs {
  jobUuid: string;
  s3Key: string;
}

export default function MerkleTreeWorker({ log, redis }: IFactoryOptions) {
  return {
    processMerkleTree: {
      plugins: ["Retry"],
      pluginOptions: {
        Retry: {
          retryLimit: 3,
          retryDelay: 5000,
        },
      },
      async perform(args: MerkleTreeJobArgs) {
        const { jobUuid, s3Key } = args;

        try {
          log.info(
            `Processing merkle tree job ${jobUuid} from S3 key ${s3Key}`
          );

          // Update job status in Redis
          await redis.set(
            `merkletree:job:${jobUuid}`,
            JSON.stringify({ status: "processing" }),
            "EX",
            86400 // 24 hour expiry
          );

          // Fetch data from S3
          const aws = Aws();

          const s3Response = await aws.getFile({ filename: s3Key });
          const body = s3Response.Body as Readable;

          // Read stream to buffer
          const chunks: Buffer[] = [];
          for await (const chunk of body) {
            chunks.push(chunk);
          }
          const dataBuffer = Buffer.concat(chunks);
          const dataString = dataBuffer.toString("utf-8");
          const data: string[][] = JSON.parse(dataString);

          if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Invalid data format: expected non-empty array");
          }

          // Validate that first element of each row is unique
          const uniqueIds = new Set<string>();
          for (const row of data) {
            if (!Array.isArray(row) || row.length === 0) {
              throw new Error("Invalid row format: expected non-empty array");
            }
            const uniqueId = String(row[0]);
            if (uniqueIds.has(uniqueId)) {
              throw new Error(`Duplicate unique_id found: ${uniqueId}`);
            }
            uniqueIds.add(uniqueId);
          }

          // Determine value types - assume all are strings for flexibility
          const valueTypes = new Array(data[0].length).fill("string");

          // Create merkle tree
          log.info(`Creating merkle tree with ${data.length} leaves`);
          const tree = StandardMerkleTree.of(data, valueTypes);
          const rootHash = tree.root;

          log.info(`Merkle tree created with root hash: ${rootHash}`);

          // Update merkletrees record
          await updateMerkleTreeByJobUuid(jobUuid, {
            root_hash: rootHash,
            job_status: "complete",
            job_status_info: null,
          });

          // Get the merkletree record to get the ID
          const merkletreeRecord = await findMerkleTreeByJobUuid(jobUuid);

          if (!merkletreeRecord) {
            throw new Error(`Merkletree record not found for job ${jobUuid}`);
          }

          const merkletreeId = merkletreeRecord.id;

          // Insert all values and proofs
          const valuesToInsert = [];
          for (const [index, value] of tree.entries()) {
            const uniqueId = String(value[0]);
            const proof = tree.getProof(index);

            valuesToInsert.push({
              merkletree_id: merkletreeId,
              unique_id: uniqueId,
              values: JSON.stringify(value),
              proof: JSON.stringify(proof),
            });
          }

          // Batch insert all values using model function
          await createMerkleTreeValues(valuesToInsert);

          log.info(
            `Inserted ${valuesToInsert.length} merkle tree values for tree ${merkletreeId}`
          );

          // Update job status in Redis
          await redis.set(
            `merkletree:job:${jobUuid}`,
            JSON.stringify({ status: "complete", root_hash: rootHash }),
            "EX",
            86400 // 24 hour expiry
          );

          log.info(`Merkle tree job ${jobUuid} completed successfully`);

          return { success: true, root_hash: rootHash };
        } catch (error: any) {
          log.error(`Error processing merkle tree job ${jobUuid}:`, error);

          // Store error in database using upsert model function
          await upsertMerkleTree({
            root_hash: "",
            job_uuid: jobUuid,
            job_status: "error",
            job_status_info: error.message || String(error),
          });

          // Update job status in Redis
          await redis.set(
            `merkletree:job:${jobUuid}`,
            JSON.stringify({
              status: "error",
              error: error.message || String(error),
            }),
            "EX",
            86400 // 24 hour expiry
          );

          // Don't rethrow to prevent retry for data validation errors
          if (
            error.message?.includes("Invalid") ||
            error.message?.includes("Duplicate")
          ) {
            return { success: false, error: error.message };
          }

          // Rethrow for infrastructure errors to trigger retry
          throw error;
        }
      },
    },
  };
}
