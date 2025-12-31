import Web3 from "web3";
import { Account } from "web3-core";

export function addAccountToWeb3(web3: Web3, pKey: string): Account {
  const cleanedPkey = pKey.slice(0, 2) == "0x" ? pKey : `0x${pKey}`;
  const account = web3.eth.accounts.privateKeyToAccount(cleanedPkey);
  web3.eth.accounts.wallet.add(account);
  return account;
}
