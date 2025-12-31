import { db } from "../database";
import { MerkleTreeValueUpdate, MerkleTreeValue, NewMerkleTreeValue } from "../types";

export async function findMerkleTreeValueById(id: number) {
  return await db
    .selectFrom("merkletree_values")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findMerkleTreeValuesByMerkleTreeId(merkletreeId: number) {
  return await db
    .selectFrom("merkletree_values")
    .where("merkletree_id", "=", merkletreeId)
    .selectAll()
    .execute();
}

export async function findMerkleTreeValueByUniqueId(merkletreeId: number, uniqueId: string) {
  return await db
    .selectFrom("merkletree_values")
    .where("merkletree_id", "=", merkletreeId)
    .where("unique_id", "=", uniqueId)
    .selectAll()
    .executeTakeFirst();
}

export async function findMerkleTreeValues(criteria: Partial<MerkleTreeValue>) {
  let query = db.selectFrom("merkletree_values");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.merkletree_id) {
    query = query.where("merkletree_id", "=", criteria.merkletree_id);
  }

  if (criteria.unique_id) {
    query = query.where("unique_id", "=", criteria.unique_id);
  }

  if (criteria.created_at) {
    query = query.where("created_at", "=", criteria.created_at);
  }

  return await query.selectAll().execute();
}

export async function updateMerkleTreeValue(id: number, updateWith: MerkleTreeValueUpdate) {
  await db
    .updateTable("merkletree_values")
    .set(updateWith)
    .where("id", "=", id)
    .execute();
}

export async function createMerkleTreeValue(merkletreeValue: NewMerkleTreeValue) {
  return await db
    .insertInto("merkletree_values")
    .values(merkletreeValue)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function createMerkleTreeValues(merkletreeValues: NewMerkleTreeValue[]) {
  return await db
    .insertInto("merkletree_values")
    .values(merkletreeValues)
    .returningAll()
    .execute();
}

export async function deleteMerkleTreeValue(id: number) {
  return await db
    .deleteFrom("merkletree_values")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteMerkleTreeValuesByMerkleTreeId(merkletreeId: number) {
  return await db
    .deleteFrom("merkletree_values")
    .where("merkletree_id", "=", merkletreeId)
    .execute();
}
