import { requireValue } from "../../libs/cliPrompt";
import { handleTornadoApiError, tornadoApiPost } from "../../libs/tornadoApiClient";

type WithdrawExecuteResponse = {
  success: boolean;
  data: {
    transactionHash: string;
  };
};

function parseArgsInput(rawArgs: string): string[] {
  try {
    const parsed = JSON.parse(rawArgs);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to comma-separated parsing.
  }

  return rawArgs
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export default {
  name: "withdraw-execute",
  description: "Execute a withdrawal proof via the tornado API",
  async action(
    tornadoInstanceAddress?: string,
    options?: {
      proof?: string;
      args?: string;
      networkId?: string;
    }
  ) {
    try {
      const resolvedInstance = await requireValue(
        tornadoInstanceAddress,
        "tornado instance address"
      );
      const resolvedProof = await requireValue(options?.proof, "proof");
      const resolvedArgsRaw = await requireValue(
        options?.args,
        "args (JSON array or comma-separated list)"
      );
      const args = parseArgsInput(resolvedArgsRaw);
      if (args.length !== 6) {
        throw new Error(
          "Invalid args format. Expected 6 elements: [root, nullifierHash, recipient, relayer, fee, refund]."
        );
      }

      const networkId = options?.networkId
        ? parseInt(options.networkId, 10)
        : undefined;

      const response = await tornadoApiPost<WithdrawExecuteResponse>(
        "/withdraw/execute",
        {
          tornadoInstanceAddress: resolvedInstance,
          proof: resolvedProof,
          args,
          networkId,
        }
      );
      console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
      handleTornadoApiError(err);
    }
  },
};
