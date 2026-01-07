import { handleTornadoApiError, tornadoApiGet } from "../../libs/tornadoApiClient";

type CurrenciesResponse = {
  success: boolean;
  data: {
    networkId: number;
    currencies: string[];
  };
};

export default {
  name: "currencies",
  description: "List supported currencies via the tornado API",
  async action(options?: { networkId?: string }) {
    try {
      const networkId = options?.networkId
        ? parseInt(options.networkId, 10)
        : undefined;

      const response = await tornadoApiGet<CurrenciesResponse>(
        "/currencies",
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
