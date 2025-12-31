type EventType = "deposit" | "withdrawal" | "withdraw";

interface IStringMap {
  [key: string]: any;
}

interface IERC20Info {
  decimals: number;
  balance: number | string;
  name: any;
  symbol: any;
}

interface IWallet {
  address: string;
  privateKey: string;
}

interface IAccount {
  address: string;
  privateKey?: string;
}

interface IAccountAndENS {
  account: IAccount;
  idx?: number;
  ens?: null | string;
}

interface IPoolInfo {
  token0?: string;
  token1?: string;
  fee: number | string;
  pool: string;
  r0: number | string;
  r1: number | string;
}

interface IDeposit {
  nullifier: any; // wBigInt
  secret: any; // wBigInt
  preimage?: Buffer;
  commitment?: string;
  commitmentHex?: string;
  nullifierHash?: string;
  nullifierHex?: string;
}

interface IDepositEvents {
  blockNumber: number;
  transactionHash: string;
  commitment: string;
  leafIndex: number;
  timestamp: number;
}

interface IWithdrawEvents {
  blockNumber: number;
  transactionHash: string;
  nullifierHash: string;
  to: string;
  fee: number;
}

interface ITornadoData {
  amount: number | string;
  currency: string;
  deposit: IDeposit;
}

interface IMerkelTree {
  root: string;
  pathElements: (number | string)[];
  pathIndices: number[];
}
