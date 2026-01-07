import { requireValue } from "../../libs/cliPrompt";
import { handleTornadoApiError, tornadoApiPost } from "../../libs/tornadoApiClient";

type WithdrawResponse = {
  success: boolean;
  data: {
    transactionHash: string;
    currency: string;
    amount: string;
    destinationAddress: string;
    relayFee: string;
  };
};

export default {
  name: "withdraw",
  description: "Withdraw funds via the tornado API",
  async action(
    depositNote?: string,
    destinationAddress?: string,
    options?: { networkId?: string }
  ) {
    try {
      const resolvedNote = await requireValue(
        depositNote,
        "deposit note"
      );
      const resolvedDestination = await requireValue(
        destinationAddress,
        "destination address"
      );
      const networkId = options?.networkId
        ? parseInt(options.networkId, 10)
        : undefined;

      const response = await tornadoApiPost<WithdrawResponse>(
        "/withdraw",
        {
          depositNote: resolvedNote,
          destinationAddress: resolvedDestination,
          networkId,
        }
      );
      console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
      handleTornadoApiError(err);
    }
  },
};
