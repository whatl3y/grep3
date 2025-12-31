import assert from "assert";
import axios from "axios";
import { BigNumber } from "bignumber.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { ethers, providers } from "ethers";
import Web3 from "web3";
import { provider, Account, Transaction } from "web3-core";
import { BlockTransactionObject } from "web3-eth";
import { Unit } from "web3-utils";
import { exponentialBackoff } from "./Utils";

export interface IAddress {
  address: string;
}

import ERC20 from "./web3/ERC20";

dayjs.extend(utc);

export default function Web3Utils(
  provider?: provider,
  httpProvUrl?: string,
  addressOpts?: IAddress
) {
  return {
    web3: new Web3(
      provider || new Web3.providers.HttpProvider(httpProvUrl || "")
    ),

    // https://github.com/ThatOtherZach/Web3-by-Example/blob/master/scripts/getBalance.js
    async getBalance(addr?: string, units: Unit = "ether"): Promise<string> {
      if (!addr) {
        assert(
          addressOpts && addressOpts.address,
          "global address not provided"
        );
        addr = addressOpts.address;
      }
      assert(addr, "address must be provided");
      const result = await exponentialBackoff(
        async () => await this.web3.eth.getBalance(addr as string)
      );
      return this.web3.utils.fromWei(result, units);
    },
  };
}

export async function genericErc20Approval(
  web3: Web3,
  userAddy: string,
  spendAmount: number | string,
  tokenAddress: string,
  delegateAddress: string
) {
  if (new BigNumber(spendAmount || 0).lte(0)) return;

  const contract = ERC20(web3, tokenAddress);
  const currentAllowance = await contract.methods
    .allowance(userAddy, delegateAddress)
    .call();
  if (new BigNumber(currentAllowance).lte(spendAmount || 0)) {
    const txn = contract.methods.approve(
      delegateAddress,
      new BigNumber(2).pow(256).minus(1).toFixed()
    );
    const gasLimit = await txn.estimateGas({
      from: userAddy,
    });
    await txn.send({
      from: userAddy,
      gasLimit: new BigNumber(gasLimit).times("1.05").toFixed(0),
    });
  }
}
