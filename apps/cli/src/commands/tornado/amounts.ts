import { requireValueFromList } from "../../libs/cliPrompt";
import {
  handleTornadoApiError,
  tornadoApiGet,
} from "../../libs/tornadoApiClient";
import { fetchTornadoCurrencies } from "../../libs/tornadoMetadata";

type AmountsResponse = {
  success: boolean;
  data: {
    currency: string;
    networkId: number;
    amounts: string[];
  };
};

export default {
  name: "amounts",
  description: "List available deposit amounts via the tornado API",
  async action(currency?: string, options?: { networkId?: string }) {
    try {
      const networkId = options?.networkId
        ? parseInt(options.networkId, 10)
        : undefined;
      const currencies = await fetchTornadoCurrencies(networkId);
      const resolvedCurrency = await requireValueFromList(
        currency?.toLowerCase(),
        "currency",
        currencies
      );

      const response = await tornadoApiGet<AmountsResponse>(
        `/amounts/${resolvedCurrency}`,
        {
          networkId,
        }
      );
      console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
      handleTornadoApiError(err);
    }
  },
};
