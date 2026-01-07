import { createInvoice } from "tornado-ts";
import { requireValueFromList } from "../../libs/cliPrompt";
import { getWeb3Instance, parseRpcUrls } from "../../libs/tornadoWeb3";
import {
  fetchTornadoAmounts,
  fetchTornadoCurrencies,
} from "../../libs/tornadoMetadata";

export default {
  name: "note-generate",
  description: "Generate a new deposit note locally",
  async action(
    currency?: string,
    amount?: string,
    options?: { networkId?: string; rpcUrl?: string; rpcUrls?: string }
  ) {
    try {
      const networkId = options?.networkId
        ? parseInt(options.networkId, 10)
        : undefined;
      const currencies = await fetchTornadoCurrencies(networkId);
      const resolvedCurrency = await requireValueFromList(
        currency?.toLowerCase(),
        "currency",
        currencies.map((c) => ({ name: c.toUpperCase(), value: c }))
      );
      const resolvedAmount = await requireValueFromList(
        amount,
        "amount",
        fetchTornadoAmounts(resolvedCurrency, networkId)
      );
      const rpcUrl = options?.rpcUrl || process.env.TORNADO_RPC_URL;
      const rpcUrls = parseRpcUrls(
        options?.rpcUrls || process.env.TORNADO_RPC_URLS
      );

      const web3 = await getWeb3Instance(networkId, rpcUrl, rpcUrls);
      const netId = await web3.eth.net.getId();
      const [, note] = await createInvoice(
        resolvedCurrency,
        resolvedAmount,
        netId
      );
      console.log(
        JSON.stringify(
          {
            success: true,
            data: {
              note,
              currency: resolvedCurrency,
              amount: resolvedAmount,
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
