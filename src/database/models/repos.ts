import { db } from "../database";
import { RepoUpdate, Repo, NewRepo } from "../types";

export async function findRepoById(id: number) {
  return await db
    .selectFrom("repo")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findRepoByAddressAndName(address: string, name: string) {
  return await db
    .selectFrom("repo")
    .where("address", "=", address)
    .where("name", "=", name)
    .selectAll()
    .executeTakeFirst();
}

export async function findRepoByInternalName(internalName: string) {
  return await db
    .selectFrom("repo")
    .where("internal_name", "=", internalName)
    .selectAll()
    .executeTakeFirst();
}

export async function findRepos(criteria: Partial<Repo>) {
  let query = db.selectFrom("repo");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id); // Kysely is immutable, you must re-assign!
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
  await db.updateTable("repo").set(updateWith).where("id", "=", id).execute();
}

export async function createRepo(repo: NewRepo) {
  return await db
    .insertInto("repo")
    .values(repo)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteRepo(id: number) {
  return await db
    .deleteFrom("repo")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
