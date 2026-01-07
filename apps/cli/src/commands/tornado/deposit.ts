import BigNumber from "bignumber.js";
import Web3 from "web3";
import { AbiItem } from "web3-utils";
import { createInvoice, initializeTC, parseNote } from "tornado-ts";
import { requireValueFromList } from "../../libs/cliPrompt";
import { getWeb3Instance, parseRpcUrls } from "../../libs/tornadoWeb3";
import {
  fetchTornadoAmounts,
  fetchTornadoCurrencies,
} from "../../libs/tornadoMetadata";

type DepositResult = {
  depositNote: string;
  transactionHash: string;
  currency: string;
  amount: string;
};

const erc20Abi: AbiItem[] = [
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
];

function addAccountToWeb3(web3: Web3, pKey: string) {
  const cleaned = pKey.startsWith("0x") ? pKey : `0x${pKey}`;
  const account = web3.eth.accounts.privateKeyToAccount(cleaned);
  web3.eth.accounts.wallet.add(account);
  return account;
}

function erc20Contract(web3: Web3, tokenAddress: string) {
  return new web3.eth.Contract(erc20Abi, tokenAddress);
}

async function getTokenBalance(
  web3: Web3,
  userAddress: string,
  tokenAddress?: string
) {
  if (!tokenAddress || new BigNumber(tokenAddress.toLowerCase()).eq(0)) {
    return {
      decimals: 18,
      balance: await web3.eth.getBalance(userAddress),
    };
  }

  const contract = erc20Contract(web3, tokenAddress);
  const decimals = await contract.methods.decimals().call();
  const balance = await contract.methods.balanceOf(userAddress).call();
  return { decimals, balance };
}

async function genericErc20Approval(
  web3: Web3,
  userAddress: string,
  spendAmount: number | string,
  tokenAddress: string,
  delegateAddress: string
) {
  if (new BigNumber(spendAmount || 0).lte(0)) return;

  const contract = erc20Contract(web3, tokenAddress);
  const currentAllowance = await contract.methods
    .allowance(userAddress, delegateAddress)
    .call();

  if (new BigNumber(currentAllowance).lte(spendAmount || 0)) {
    const txn = contract.methods.approve(
      delegateAddress,
      new BigNumber(2).pow(256).minus(1).toFixed()
    );
    const gasLimit = await txn.estimateGas({
      from: userAddress,
    });
    await txn.send({
      from: userAddress,
      gasLimit: new BigNumber(gasLimit).times("1.05").toFixed(0),
    });
  }
}

async function depositToTornado(
  web3: Web3,
  currency: string,
  amount: string,
  userPrivateKey: string
): Promise<DepositResult> {
  const netId = await web3.eth.net.getId();
  const {
    tokenAddress,
    tornadoRouter,
    tornadoRouterAddress,
    tornadoInstanceAddress,
  } = await initializeTC(web3, currency, amount);

  const userAccount = addAccountToWeb3(web3, userPrivateKey);
  const userAddress = userAccount.address;

  const balanceInfo = await getTokenBalance(web3, userAddress, tokenAddress);
  const depositAmountRaw = new BigNumber(amount)
    .times(new BigNumber(10).pow(balanceInfo.decimals))
    .toFixed();

  if (new BigNumber(balanceInfo.balance).lt(depositAmountRaw)) {
    throw new Error(
      `Insufficient balance. Required: ${amount} ${currency.toUpperCase()}`
    );
  }

  const [, depositNote] = await createInvoice(currency, amount, netId);
  const { deposit } = await parseNote(depositNote);

  const txn = tornadoRouter.methods.deposit(
    tornadoInstanceAddress,
    deposit.commitmentHex,
    []
  );

  let txnOutput: any;
  if (tokenAddress && new BigNumber(tokenAddress.toLowerCase()).gt(0)) {
    await genericErc20Approval(
      web3,
      userAddress,
      depositAmountRaw,
      tokenAddress,
      tornadoRouterAddress
    );
    const gasLimit = await txn.estimateGas({
      from: userAddress,
    });
    txnOutput = await txn.send({
      from: userAddress,
      gasLimit: new BigNumber(gasLimit).times("1.05").toFixed(0),
      gasPrice: new BigNumber(await web3.eth.getGasPrice())
        .times("1.1")
        .toFixed(0),
    });
  } else {
    const gasLimit = await txn.estimateGas({
      from: userAddress,
      value: depositAmountRaw,
    });
    txnOutput = await txn.send({
      from: userAddress,
      value: depositAmountRaw,
      gasLimit: new BigNumber(gasLimit).times("1.05").toFixed(0),
      gasPrice: new BigNumber(await web3.eth.getGasPrice())
        .times("1.1")
        .toFixed(0),
    });
  }

  return {
    depositNote,
    transactionHash: txnOutput.transactionHash,
    currency,
    amount,
  };
}

export default {
  name: "deposit",
  description: "Deposit funds locally (no API) and return the generated note",
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
        currencies
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

      const userPrivateKey =
        process.env.TORNADO_PRIVATE_KEY || process.env.TORNADO_USER_PRIVATE_KEY;
      if (!userPrivateKey) {
        throw new Error(
          "Missing TORNADO_PRIVATE_KEY (or TORNADO_USER_PRIVATE_KEY) in the environment."
        );
      }

      const web3 = await getWeb3Instance(networkId, rpcUrl, rpcUrls);
      const result = await depositToTornado(
        web3,
        resolvedCurrency,
        resolvedAmount,
        userPrivateKey
      );
      console.log(JSON.stringify({ success: true, data: result }, null, 2));
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  },
};
