import BigNumber from "bignumber.js";
import Web3 from "web3";
import { rmDecimalBN } from "./Utils";
import ERC20 from "./web3/ERC20";

export default function Web3Helpers(web3: Web3) {
  return {
    async getETHBalance(address: string) {
      const checkBalance = new BigNumber(
        await web3.eth.getBalance(address)
      ).div(new BigNumber(10).pow(18));
      return rmDecimalBN(checkBalance);
    },

    async getTokenBalance(
      userAddress: string,
      tokenAddress?: string
    ): Promise<IERC20Info> {
      if (!tokenAddress || new BigNumber(tokenAddress.toLowerCase()).eq(0)) {
        return {
          decimals: 18,
          balance: await web3.eth.getBalance(userAddress),
          name: "Ether",
          symbol: "ETH",
        };
      }
      const erc20 = ERC20(web3, tokenAddress);
      const decimals = await erc20.methods.decimals().call();
      return {
        decimals,
        balance: await erc20.methods.balanceOf(userAddress).call(),
        name: await erc20.methods.name().call(),
        symbol: await erc20.methods.symbol().call(),
      };
    },
  };
}
