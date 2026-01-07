import { deployments } from "tornado-ts";

type DeploymentConfig = {
  instanceAddress?: Record<string, string>;
};

type NetworkDeployment = Record<string, DeploymentConfig>;

function getNetworkDeployments(networkId?: number): NetworkDeployment[] {
  const allNetworks = Object.keys(deployments || {});
  if (!networkId) {
    return allNetworks.map(
      (key) => (deployments as any)[key] as NetworkDeployment
    );
  }

  const key = `netId${networkId}`;
  const network = (deployments as any)[key] as NetworkDeployment | undefined;
  if (!network) {
    throw new Error(`Unsupported networkId ${networkId}.`);
  }
  return [network];
}

function isCurrencyDeployment(value: unknown): value is DeploymentConfig {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "instanceAddress" in (value as DeploymentConfig)
  );
}

function sortAmounts(amounts: string[]): string[] {
  return amounts.sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
      return left.localeCompare(right);
    }
    return leftNumber - rightNumber;
  });
}

export async function fetchTornadoCurrencies(
  networkId?: number
): Promise<string[]> {
  const networks = getNetworkDeployments(networkId);
  const currencies = new Set<string>();
  for (const network of networks) {
    for (const [currency, config] of Object.entries(network)) {
      if (currency === "proxy") continue;
      if (isCurrencyDeployment(config)) {
        currencies.add(currency);
      }
    }
  }

  const sorted = Array.from(currencies).sort();
  if (sorted.length === 0) {
    throw new Error("Unable to load available tornado currencies.");
  }
  return sorted;
}

export function fetchTornadoAmounts(
  currency: string,
  networkId?: number
): string[] {
  const networks = getNetworkDeployments(networkId);
  const amounts = new Set<string>();
  for (const network of networks) {
    const config = network[currency] as DeploymentConfig | undefined;
    if (!isCurrencyDeployment(config)) continue;
    const instances = config.instanceAddress || {};
    for (const amount of Object.keys(instances)) {
      amounts.add(amount);
    }
  }

  const sorted = sortAmounts(Array.from(amounts));
  if (sorted.length === 0) {
    throw new Error("Unable to load available tornado amounts.");
  }
  return sorted;
}
