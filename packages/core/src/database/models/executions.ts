import { db } from "../database";
import { ExecutionUpdate, Execution, NewExecution } from "../types";

export async function findExecutionById(id: number) {
  return await db
    .selectFrom("executions")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findExecutionByImageHash(imageHash: string) {
  return await db
    .selectFrom("executions")
    .where("image_hash", "=", imageHash)
    .selectAll()
    .executeTakeFirst();
}

export async function findExecutionsByRepoId(repoId: number) {
  return await db
    .selectFrom("executions")
    .where("repo_id", "=", repoId)
    .selectAll()
    .execute();
}

export async function findExecutions(criteria: Partial<Execution>) {
  let query = db.selectFrom("executions");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id); // Kysely is immutable, you must re-assign!
  }

  if (criteria.repo_id) {
    query = query.where("repo_id", "=", criteria.repo_id);
  }

  if (criteria.image_hash) {
    query = query.where("image_hash", "=", criteria.image_hash);
  }

  if (criteria.container_hash) {
    query = query.where("container_hash", "=", criteria.container_hash);
  }

  if (criteria.created_at) {
    query = query.where("created_at", "=", criteria.created_at);
  }

  return await query.selectAll().execute();
}

export async function updateExecution(id: number, updateWith: ExecutionUpdate) {
  await db
    .updateTable("executions")
    .set(updateWith)
    .where("id", "=", id)
    .execute();
}

export async function createExecution(execution: NewExecution) {
  return await db
    .insertInto("executions")
    .values(execution)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteExecution(id: number) {
  return await db
    .deleteFrom("executions")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
