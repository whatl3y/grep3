import { initializeTC, noteRegex, parseNote } from "tornado-ts";
import { requireValue } from "../../libs/cliPrompt";
import { getWeb3Instance, parseRpcUrls } from "../../libs/tornadoWeb3";

export default {
  name: "note-check",
  description: "Check a deposit note locally",
  async action(
    depositNote?: string,
    options?: { networkId?: string; rpcUrl?: string; rpcUrls?: string }
  ) {
    try {
      const resolvedNote = await requireValue(
        depositNote,
        "deposit note"
      );
      const networkId = options?.networkId
        ? parseInt(options.networkId, 10)
        : undefined;
      const rpcUrl = options?.rpcUrl || process.env.TORNADO_RPC_URL;
      const rpcUrls = parseRpcUrls(
        options?.rpcUrls || process.env.TORNADO_RPC_URLS
      );

      if (!noteRegex().test(resolvedNote)) {
        throw new Error("Invalid deposit note format");
      }

      const web3 = await getWeb3Instance(networkId, rpcUrl, rpcUrls);
      const { deposit, currency, amount } = await parseNote(resolvedNote);
      const { tornadoInstance } = await initializeTC(
        web3,
        currency,
        amount
      );

      const nullifierHash =
        deposit.nullifierHash || deposit.nullifierHex;
      if (!nullifierHash) {
        throw new Error("Unable to derive nullifier hash from note");
      }

      const isWithdrawn = await tornadoInstance.methods
        .isSpent(nullifierHash)
        .call();

      console.log(
        JSON.stringify(
          {
            success: true,
            data: {
              isWithdrawn: Boolean(isWithdrawn),
            },
          },
          null,
          2
        )
      );
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  },
};
