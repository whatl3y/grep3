import Web3 from "web3";

const defaultRpcUrls = [
  "https://eth.blockrazor.xyz",
  "https://bsc.publicnode.com",
  "https://arbitrum-one.publicnode.com",
];

export function parseRpcUrls(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export async function getWeb3Instance(
  networkId?: number,
  rpcUrl?: string,
  rpcUrls?: string[]
): Promise<Web3> {
  const candidates = rpcUrl
    ? [rpcUrl]
    : rpcUrls && rpcUrls.length > 0
      ? rpcUrls
      : defaultRpcUrls;

  let lastError: Error | undefined;
  for (const url of candidates) {
    const web3 = new Web3(url);
    try {
      const netId = await web3.eth.net.getId();
      if (!networkId || networkId === netId) {
        return web3;
      }
      lastError = new Error(
        `RPC ${url} is on network ${netId}, expected ${networkId}`
      );
    } catch (err: any) {
      lastError = err;
    }
  }

  throw (
    lastError ||
    new Error("Unable to connect to any configured Web3 RPC.")
  );
}
