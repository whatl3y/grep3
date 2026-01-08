import path from "path";
import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { isAddress, getAddress, verifyMessage } from "ethers";
import {
  findRepoByAddressAndName,
  createChallenge,
  regenerateRepoNonce,
  generateNonce,
} from "@grep3/core";
import { IRoute } from "./index";

/**
 * GET /auth/challenge/:address/:repo
 *
 * Returns a challenge that must be signed to authenticate pushes to an existing repository.
 * For new repositories, authentication is not required on the first push.
 *
 * Response:
 * - 200: Challenge object with message to sign
 * - 404: Repository not found (no auth needed for first push)
 * - 400: Invalid address format
 */
export const getChallenge: IRoute = {
  method: "get",
  path: "/auth/challenge/:address/:repo",
  async handler(req: Request, res: Response) {
    try {
      const { address, repo } = req.params;

      // Validate address
      if (!isAddress(address)) {
        return res.status(400).json({
          error: "Invalid Ethereum address",
        });
      }

      const checksumAddress = getAddress(address);
      const repoName = repo.endsWith(".git") ? repo : `${repo}.git`;

      // Check if repo exists
      const existingRepo = await findRepoByAddressAndName(checksumAddress, repoName);

      if (!existingRepo) {
        return res.status(404).json({
          error: "Repository not found",
          message:
            "This repository does not exist yet. " +
            "No authentication is required for the first push to claim a new repository.",
        });
      }

      // Generate challenge
      const challenge = createChallenge(
        checksumAddress,
        repoName,
        existingRepo.auth_nonce
      );

      return res.json({
        ...challenge,
        instructions: {
          description:
            "Sign the 'message' field with your Ethereum wallet to authenticate.",
          credentialFormat:
            "Use the signature (0x...) as the git password when pushing.",
          example: "0x1234...abcd",
          persistent: true,
          note: "Signatures can be reused until revoked. To revoke, use POST /auth/revoke/:address/:repo with a signed revocation message.",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  },
};

/**
 * GET /auth/docs
 *
 * Returns documentation about the authentication flow as a styled HTML page.
 */
export const authDocs: IRoute = {
  method: "get",
  path: "/auth/docs",
  async handler(_req: Request, res: Response) {
    try {
      const html = await readFile(
        path.join(__dirname, "..", "..", "templates", "auth-docs.html"),
        "utf-8"
      );
      return res.type("html").send(html);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).send(message);
    }
  },
};

/**
 * POST /auth/revoke/:address/:repo
 *
 * Revokes all existing signatures for a repository by regenerating the nonce.
 * Requires a signature of the revocation message to prove ownership.
 *
 * Request body:
 * - signature: Signed message "grep3:revoke:{address}:{repo}"
 *
 * Response:
 * - 200: Revocation successful, new challenge returned
 * - 400: Invalid request (missing signature, invalid address)
 * - 401: Invalid signature
 * - 404: Repository not found
 */
export const revokeSignatures: IRoute = {
  method: "post",
  path: "/auth/revoke/:address/:repo",
  async handler(req: Request, res: Response) {
    try {
      const { address, repo } = req.params;
      const { signature } = req.body;

      // Validate address
      if (!isAddress(address)) {
        return res.status(400).json({
          error: "Invalid Ethereum address",
        });
      }

      if (!signature || typeof signature !== "string") {
        return res.status(400).json({
          error: "Missing signature",
          message: "Sign the message 'grep3:revoke:{address}:{repo}' and include the signature in the request body.",
        });
      }

      const checksumAddress = getAddress(address);
      const repoName = repo.endsWith(".git") ? repo : `${repo}.git`;

      // Check if repo exists
      const existingRepo = await findRepoByAddressAndName(checksumAddress, repoName);

      if (!existingRepo) {
        return res.status(404).json({
          error: "Repository not found",
        });
      }

      // Verify the revocation signature
      const revokeMessage = `grep3:revoke:${checksumAddress}:${repoName}`;
      try {
        const recoveredAddress = verifyMessage(revokeMessage, signature);
        const recoveredChecksumAddress = getAddress(recoveredAddress);

        if (recoveredChecksumAddress !== checksumAddress) {
          return res.status(401).json({
            error: "Invalid signature",
            message: "Signature does not match the expected address.",
          });
        }
      } catch {
        return res.status(401).json({
          error: "Invalid signature",
          message: "Could not verify signature.",
        });
      }

      // Regenerate nonce to invalidate all existing signatures
      const newNonce = generateNonce();
      await regenerateRepoNonce(existingRepo.id, newNonce);

      // Return new challenge
      const challenge = createChallenge(checksumAddress, repoName, newNonce);

      return res.json({
        success: true,
        info: "All existing signatures have been revoked. Sign the new message to create a new credential.",
        ...challenge,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  },
};
