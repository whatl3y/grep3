import { db } from "../database";
import { Address, NewAddress } from "../types";

export async function findAddressById(id: number) {
  return await db
    .selectFrom("addresses")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findAddressByAddress(address: string) {
  return await db
    .selectFrom("addresses")
    .where("address", "=", address)
    .selectAll()
    .executeTakeFirst();
}

export async function findAddresses(criteria: Partial<Address>) {
  let query = db.selectFrom("addresses");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.address) {
    query = query.where("address", "=", criteria.address);
  }

  if (criteria.created_at) {
    query = query.where("created_at", "=", criteria.created_at);
  }

  return await query.selectAll().execute();
}

export async function createAddress(addressData: NewAddress) {
  return await db
    .insertInto("addresses")
    .values(addressData)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findOrCreateAddress(address: string, nonce?: number) {
  const existing = await findAddressByAddress(address);
  if (existing) {
    return existing;
  }

  return await createAddress({
    address,
    auth_nonce: nonce,
  });
}

/**
 * Regenerate the auth nonce for an address to revoke all existing signatures.
 * This invalidates any previously signed credentials for the address.
 */
export async function regenerateAddressNonce(id: number, newNonce: number) {
  return await db
    .updateTable("addresses")
    .set({ auth_nonce: newNonce })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
