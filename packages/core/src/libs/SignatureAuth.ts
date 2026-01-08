import crypto from "crypto";
import { verifyMessage, getAddress } from "ethers";

/**
 * SignatureAuth provides Ethereum signature-based authentication for git pushes.
 *
 * Authentication flow:
 * 1. Client requests a challenge for an address/repo combination
 * 2. Server returns a challenge containing: address, repo, nonce
 * 3. Client signs the challenge message with their Ethereum private key
 * 4. Client provides the signature as the password in git credentials
 * 5. Server verifies the signature recovers to the expected address
 *
 * Signatures are persistent and can be reused until revoked. Revoking
 * regenerates the nonce, which invalidates all existing signatures.
 *
 * Message format: "grep3:push:{address}:{repo}:{nonce}"
 */

export interface AuthChallenge {
  address: string;
  repo: string;
  nonce: number;
  message: string;
}

export interface SignatureAuthOptions {
  // Reserved for future options
}

/**
 * Creates the message that must be signed for authentication.
 * This message format is deterministic and can be reconstructed by both client and server.
 * The message does NOT include a timestamp, so signatures are persistent until the nonce changes.
 */
export function createAuthMessage(
  address: string,
  repo: string,
  nonce: number
): string {
  // Normalize address to checksum format
  const checksumAddress = getAddress(address);
  // Normalize repo name (ensure .git suffix)
  const normalizedRepo = repo.endsWith(".git") ? repo : `${repo}.git`;

  return `grep3:push:${checksumAddress}:${normalizedRepo}:${nonce}`;
}

/**
 * Creates a challenge for the client to sign.
 * The challenge message is persistent - once signed, it can be reused until revoked.
 */
export function createChallenge(
  address: string,
  repo: string,
  nonce: number
): AuthChallenge {
  const checksumAddress = getAddress(address);
  const normalizedRepo = repo.endsWith(".git") ? repo : `${repo}.git`;
  const message = createAuthMessage(checksumAddress, normalizedRepo, nonce);

  return {
    address: checksumAddress,
    repo: normalizedRepo,
    nonce,
    message,
  };
}

/**
 * Verifies that a signature is valid for the given parameters.
 * Signatures are persistent and do not expire - they remain valid until the nonce is changed.
 *
 * @param signature - The signature provided by the user (hex string starting with 0x)
 * @param expectedAddress - The Ethereum address that should have signed
 * @param repo - The repository name
 * @param nonce - The nonce from the database
 * @returns true if signature is valid and from the expected address
 */
export function verifySignature(
  signature: string,
  expectedAddress: string,
  repo: string,
  nonce: number
): { valid: boolean; error?: string } {
  try {
    // Reconstruct the message that should have been signed
    const message = createAuthMessage(expectedAddress, repo, nonce);

    // Recover the address from the signature
    const recoveredAddress = verifyMessage(message, signature);

    // Check if the recovered address matches the expected address
    const expectedChecksumAddress = getAddress(expectedAddress);
    const recoveredChecksumAddress = getAddress(recoveredAddress);

    if (recoveredChecksumAddress !== expectedChecksumAddress) {
      return {
        valid: false,
        error: "Signature does not match the expected address",
      };
    }

    return { valid: true };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: `Invalid signature: ${errMessage}` };
  }
}

/**
 * Parses the credential field from git credentials.
 * Expected format: "0x{signature}" (hex string)
 */
export function parseAuthCredential(credential: string): {
  signature: string;
} | null {
  // Format: 0x{signature} - standard Ethereum signature is 65 bytes = 130 hex chars
  const match = credential.match(/^(0x[a-fA-F0-9]{130})$/);
  if (!match) {
    return null;
  }

  return {
    signature: match[1],
  };
}

/**
 * Generates a random nonce for a new repository.
 * This is stored in the database and must be included in signed messages.
 * Note: PostgreSQL integer is signed 32-bit, max value 2147483647.
 */
export function generateNonce(): number {
  // Generate a random 31-bit integer (0 to 2147483647) to fit in PostgreSQL integer
  return crypto.randomBytes(4).readUInt32BE(0) >>> 1;
}

/**
 * Increments a nonce after a successful authenticated push.
 * This prevents replay attacks.
 */
export function incrementNonce(currentNonce: number): number {
  // Increment and wrap around at PostgreSQL integer max (2147483647)
  const PG_INT_MAX = 2147483647;
  return currentNonce >= PG_INT_MAX ? 0 : currentNonce + 1;
}
