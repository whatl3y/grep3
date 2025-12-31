import { db } from "../database";
import { MerkleTreeUpdate, MerkleTree, NewMerkleTree } from "../types";

export async function findMerkleTreeById(id: number) {
  return await db
    .selectFrom("merkletrees")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findMerkleTreeByJobUuid(jobUuid: string) {
  return await db
    .selectFrom("merkletrees")
    .where("job_uuid", "=", jobUuid)
    .selectAll()
    .executeTakeFirst();
}

export async function findMerkleTreeByRootHash(rootHash: string) {
  return await db
    .selectFrom("merkletrees")
    .where("root_hash", "=", rootHash)
    .selectAll()
    .executeTakeFirst();
}

export async function findMerkleTrees(criteria: Partial<MerkleTree>) {
  let query = db.selectFrom("merkletrees");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.root_hash) {
    query = query.where("root_hash", "=", criteria.root_hash);
  }

  if (criteria.job_uuid) {
    query = query.where("job_uuid", "=", criteria.job_uuid);
  }

  if (criteria.job_status) {
    query = query.where("job_status", "=", criteria.job_status);
  }

  if (criteria.created_at) {
    query = query.where("created_at", "=", criteria.created_at);
  }

  return await query.selectAll().execute();
}

export async function updateMerkleTree(id: number, updateWith: MerkleTreeUpdate) {
  await db
    .updateTable("merkletrees")
    .set(updateWith)
    .where("id", "=", id)
    .execute();
}

export async function updateMerkleTreeByJobUuid(jobUuid: string, updateWith: MerkleTreeUpdate) {
  await db
    .updateTable("merkletrees")
    .set(updateWith)
    .where("job_uuid", "=", jobUuid)
    .execute();
}

export async function createMerkleTree(merkletree: NewMerkleTree) {
  return await db
    .insertInto("merkletrees")
    .values(merkletree)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function upsertMerkleTree(merkletree: NewMerkleTree) {
  return await db
    .insertInto("merkletrees")
    .values(merkletree)
    .onConflict((oc) =>
      oc.column("job_uuid").doUpdateSet({
        root_hash: merkletree.root_hash,
        job_status: merkletree.job_status,
        job_status_info: merkletree.job_status_info,
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteMerkleTree(id: number) {
  return await db
    .deleteFrom("merkletrees")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
