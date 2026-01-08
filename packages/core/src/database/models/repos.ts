import { db } from "../database";
import { RepoUpdate, Repo, NewRepo } from "../types";

export async function findRepoById(id: number) {
  return await db
    .selectFrom("repos")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findRepoByAddressAndName(address: string, name: string) {
  return await db
    .selectFrom("repos")
    .where("address", "=", address)
    .where("name", "=", name)
    .selectAll()
    .executeTakeFirst();
}

export async function findRepoByInternalName(internalName: string) {
  return await db
    .selectFrom("repos")
    .where("internal_name", "=", internalName)
    .selectAll()
    .executeTakeFirst();
}

export async function findRepos(criteria: Partial<Repo>) {
  let query = db.selectFrom("repos");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.address) {
    query = query.where("address", "=", criteria.address);
  }

  if (criteria.name) {
    query = query.where("name", "=", criteria.name);
  }

  if (criteria.created_at) {
    query = query.where("created_at", "=", criteria.created_at);
  }

  return await query.selectAll().execute();
}

export async function updateRepo(id: number, updateWith: RepoUpdate) {
  await db.updateTable("repos").set(updateWith).where("id", "=", id).execute();
}

export async function createRepo(repos: NewRepo) {
  return await db
    .insertInto("repos")
    .values(repos)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteRepo(id: number) {
  return await db
    .deleteFrom("repos")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Regenerate the auth nonce for a repository to revoke all existing signatures.
 * This invalidates any previously signed credentials for the repo.
 */
export async function regenerateRepoNonce(id: number, newNonce: number) {
  return await db
    .updateTable("repos")
    .set({ auth_nonce: newNonce })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
