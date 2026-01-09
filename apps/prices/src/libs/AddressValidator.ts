import bs58 from "bs58";
import { isAddress } from "ethers";
import { TokenInputType } from "../types";

// EVM address: 0x prefix + 40 hex characters
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Solana address: Base58 encoded, typically 32-44 characters
// Excludes 0, O, I, l which are not in Base58
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function identifyTokenInput(token: string): TokenInputType {
  // Check EVM address first (has distinct 0x prefix)
  if (EVM_ADDRESS_REGEX.test(token)) {
    return "evm_address";
  }

  // Check if it looks like a Solana address
  if (SOLANA_ADDRESS_REGEX.test(token) && isValidSolanaAddress(token)) {
    return "solana_address";
  }

  // Default to symbol
  return "symbol";
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    const decoded = bs58.decode(address);
    // Solana public keys are 32 bytes
    return decoded.length === 32;
  } catch {
    return false;
  }
}

export function isValidEvmAddress(address: string): boolean {
  return isAddress(address);
}

export function normalizeEvmAddress(address: string): string {
  // ethers.getAddress returns checksummed address
  // but isAddress doesn't transform, so we just lowercase for consistency
  return address.toLowerCase();
}

export default {
  identifyTokenInput,
  isValidSolanaAddress,
  isValidEvmAddress,
  normalizeEvmAddress,
};
