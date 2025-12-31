import BigNumber from "bignumber.js";
import fs from "fs/promises";
import path from "path";
import Web3 from "web3";
import {
  initializeTC,
  noteRegex,
  loadDepositData,
  parseNote,
  createInvoice,
  generateProof,
  merkleTreeHeight,
} from "tornado-ts";
import { genericErc20Approval } from "./Web3Utils";
import { addAccountToWeb3 } from "./Wallets";
import Web3Helpers from "./Web3Helpers";
import config from "../config";

/**
 * Interface for deposit note check result
 */
export interface IDepositNoteCheckResult {
  currency: string;
  amount: string;
  timestamp: number;
  from: string;
  txHash: string;
  commitment: string;
  isSpent: boolean;
  blockNumber: number;
  leafIndex: number;
}

/**
 * Interface for deposit operation result
 */
export interface IDepositResult {
  depositNote: string;
  transactionHash: string;
  currency: string;
  amount: string;
}

/**
 * Interface for note generation result
 */
export interface INoteGenerationResult {
  note: string;
  currency: string;
  amount: string;
}

/**
 * Interface for withdraw operation result
 */
export interface IWithdrawResult {
  transactionHash: string;
  currency: string;
  amount: string;
  destinationAddress: string;
  relayFee: string;
}

/**
 * Checks the status of a deposit note
 * @param web3 - Web3 instance
 * @param depositNote - The deposit note to check
 * @returns Deposit information including spent status
 * @throws Error if note is invalid or not found
 */
export async function checkDepositNote(
  web3: Web3,
  depositNote: string
): Promise<IDepositNoteCheckResult> {
  if (!noteRegex().test(depositNote)) {
    throw new Error("Invalid deposit note format");
  }

  const { deposit, currency, amount } = await parseNote(depositNote);
  const { tornadoInstance, deployedBlockNumber } = await initializeTC(
    web3,
    currency,
    amount
  );

  const depositInfo = await loadDepositData(
    web3,
    deposit,
    tornadoInstance,
    deployedBlockNumber
  );

  if (!depositInfo) {
    throw new Error("Deposit not found for this note");
  }

  return {
    currency,
    amount,
    timestamp: depositInfo.timestamp,
    from: depositInfo.from,
    txHash: depositInfo.txHash,
    commitment: depositInfo.commitment,
    isSpent: depositInfo.isSpent,
    blockNumber: depositInfo.blockNumber,
    leafIndex: depositInfo.leafIndex,
  };
}

/**
 * Generates a new deposit note for a given currency and amount
 * @param web3 - Web3 instance
 * @param currency - The currency (e.g., "eth", "dai")
 * @param amount - The amount to deposit (e.g., "0.1", "100")
 * @returns Generated note information
 */
export async function generateDepositNote(
  web3: Web3,
  currency: string,
  amount: string
): Promise<INoteGenerationResult> {
  const netId = await web3.eth.net.getId();
  const [, noteString] = await createInvoice(currency, amount, netId);

  return {
    note: noteString,
    currency,
    amount,
  };
}

/**
 * Deposits funds into Tornado Cash
 * @param web3 - Web3 instance
 * @param currency - The currency to deposit (e.g., "eth", "dai")
 * @param amount - The amount to deposit (e.g., "0.1", "100")
 * @param userPrivateKey - Private key of the wallet depositing funds
 * @returns Deposit result including transaction hash and deposit note
 * @throws Error if insufficient balance or other issues
 */
export async function depositToTornado(
  web3: Web3,
  currency: string,
  amount: string,
  userPrivateKey: string
): Promise<IDepositResult> {
  const netId = await web3.eth.net.getId();

  const {
    tokenAddress,
    tornadoRouter,
    tornadoRouterAddress,
    tornadoInstanceAddress,
  } = await initializeTC(web3, currency, amount);

  // Add user account to web3
  const userAccount = addAccountToWeb3(web3, userPrivateKey);
  const userAddress = userAccount.address;

  // Check balance
  const userBalInfo = await Web3Helpers(web3).getTokenBalance(
    userAddress,
    tokenAddress
  );
  const userBalRaw = userBalInfo.balance;
  const depositAmountRaw = new BigNumber(amount)
    .times(new BigNumber(10).pow(userBalInfo.decimals))
    .toFixed();

  if (new BigNumber(userBalRaw).lt(depositAmountRaw)) {
    throw new Error(
      `Insufficient balance. Required: ${amount} ${currency.toUpperCase()}`
    );
  }

  // Generate deposit note
  const [, depositNote] = await createInvoice(currency, amount, netId);
  const { deposit } = await parseNote(depositNote);

  // Prepare deposit transaction
  const txn = tornadoRouter.methods.deposit(
    tornadoInstanceAddress,
    deposit.commitmentHex,
    []
  );

  let txnOutput: any;

  // Handle ERC20 tokens vs native currency
  if (tokenAddress && new BigNumber(tokenAddress.toLowerCase()).gt(0)) {
    // Approve token spending
    await genericErc20Approval(
      web3,
      userAddress,
      depositAmountRaw,
      tokenAddress,
      tornadoRouterAddress
    );

    // Execute deposit
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
    // Native currency deposit
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

/**
 * Withdraws funds from Tornado Cash
 * @param web3 - Web3 instance
 * @param depositNote - The deposit note to withdraw
 * @param destinationAddress - Address to receive the withdrawn funds
 * @param relayPrivateKey - Private key of the relay wallet (pays gas)
 * @param relayAddress - Address of the relay (receives fee)
 * @param relayFeePercentage - Fee percentage (default from config)
 * @param provingKeyPath - Path to proving key file (optional, uses default if not provided)
 * @returns Withdrawal result including transaction hash
 * @throws Error if note is invalid, already spent, or not deposited
 */
export async function withdrawFromTornado(
  web3: Web3,
  depositNote: string,
  destinationAddress: string,
  relayPrivateKey: string,
  relayAddress?: string,
  relayFeePercentage?: string,
  provingKeyPath?: string
): Promise<IWithdrawResult> {
  // Validate inputs
  if (!noteRegex().test(depositNote)) {
    throw new Error("Invalid deposit note format");
  }

  if (!web3.utils.isAddress(destinationAddress)) {
    throw new Error("Invalid destination address");
  }

  // Parse note and initialize Tornado Cash
  const { deposit, currency, amount } = await parseNote(depositNote);

  const {
    tornadoRouter,
    tornadoInstance,
    tornadoInstanceAddress,
    deployedBlockNumber,
    decimals,
    deploymentConfig,
  } = await initializeTC(web3, currency, amount);

  // Check if note has been deposited
  const hasBeenDeposited = await tornadoInstance.methods
    .commitments(deposit.commitmentHex)
    .call();
  if (!hasBeenDeposited) {
    throw new Error("This deposit note has not been deposited yet");
  }

  // Check if note has already been spent
  const isSpent = await tornadoInstance.methods
    .isSpent(deposit.nullifierHex)
    .call();
  if (isSpent) {
    throw new Error("This deposit note has already been withdrawn");
  }

  // Load proving key
  const defaultProvingKeyPath = path.join(
    __dirname,
    "..",
    "..",
    "build",
    "circuits",
    "tornadoProvingKey.bin"
  );
  const provingKey = (
    await fs.readFile(provingKeyPath || defaultProvingKeyPath)
  ).buffer;

  // Calculate relay fee
  const feePercentage = relayFeePercentage || config.relayFeePercentage;
  const relayAddr = relayAddress || config.relayAddress;

  const feeFromPerc = new BigNumber(amount)
    .times(new BigNumber(10).pow(decimals))
    .times(feePercentage)
    .div(100);

  const feeMax = new BigNumber(
    deploymentConfig.relayFeeMax &&
    new BigNumber(deploymentConfig.relayFeeMax).gt(0)
      ? deploymentConfig.relayFeeMax
      : config.relayFeeMax
  ).times(new BigNumber(10).pow(decimals));

  const feeMin = new BigNumber(
    deploymentConfig.relayFeeMin &&
    new BigNumber(deploymentConfig.relayFeeMin).gt(0)
      ? deploymentConfig.relayFeeMin
      : config.relayFeeMin
  ).times(new BigNumber(10).pow(decimals));

  const feeFinal = feeFromPerc.lt(feeMin)
    ? feeMin.toFixed(0)
    : feeFromPerc.gt(feeMax)
    ? feeMax.toFixed(0)
    : feeFromPerc.toFixed(0);

  // Generate zero-knowledge proof
  const { proof, args } = await generateProof(
    web3,
    tornadoInstance,
    merkleTreeHeight,
    deployedBlockNumber,
    provingKey,
    deposit,
    destinationAddress,
    relayAddr,
    feeFinal,
    0
  );

  // Execute withdrawal
  const from = web3.eth.accounts.privateKeyToAccount(
    relayPrivateKey.startsWith("0x") ? relayPrivateKey : `0x${relayPrivateKey}`
  ).address;

  const txn = tornadoRouter.methods.withdraw(
    tornadoInstanceAddress,
    proof,
    ...args
  );

  const gasLimit = await txn.estimateGas({ from });
  const txnOutput = await txn.send({
    from,
    gasLimit: new BigNumber(gasLimit).times("1.05").toFixed(0),
    gasPrice: new BigNumber(await web3.eth.getGasPrice())
      .times("1.1")
      .toFixed(0),
  });

  return {
    transactionHash: txnOutput.transactionHash,
    currency,
    amount,
    destinationAddress,
    relayFee: new BigNumber(feeFinal)
      .div(new BigNumber(10).pow(decimals))
      .toFixed(),
  };
}

/**
 * Executes a withdrawal with pre-generated proof and args
 * @param web3 - Web3 instance
 * @param tornadoInstanceAddress - Address of the tornado instance contract
 * @param proof - Pre-generated zero-knowledge proof
 * @param args - Pre-generated proof arguments [root, nullifierHash, recipient, relayer, fee, refund]
 * @param relayPrivateKey - Private key of the relay wallet (pays gas)
 * @returns Withdrawal result including transaction hash
 * @throws Error if proof is invalid or transaction fails
 */
export async function executeWithdrawalWithProof(
  web3: Web3,
  tornadoInstanceAddress: string,
  proof: string,
  args: any[],
  relayPrivateKey: string
): Promise<{ transactionHash: string }> {
  // Validate tornado instance address
  if (!web3.utils.isAddress(tornadoInstanceAddress)) {
    throw new Error("Invalid tornado instance address");
  }

  // Validate proof and args
  if (!proof || typeof proof !== "string") {
    throw new Error("Invalid proof format");
  }

  if (!Array.isArray(args) || args.length !== 6) {
    throw new Error(
      "Invalid args format. Expected array of 6 elements: [root, nullifierHash, recipient, relayer, fee, refund]"
    );
  }

  // Get tornado router - we need to know which network we're on
  const netId = await web3.eth.net.getId();
  const networkConfig = config.tornadoDeployments[`netId${netId}`];

  if (!networkConfig || !networkConfig.tornadoRouter) {
    throw new Error(`Tornado router not found for network ${netId}`);
  }

  const { tornadoRouter } = await initializeTC(
    web3,
    "eth", // dummy values since we just need the router
    "0.1"
  );

  // Execute withdrawal using relay account
  const from = web3.eth.accounts.privateKeyToAccount(
    relayPrivateKey.startsWith("0x") ? relayPrivateKey : `0x${relayPrivateKey}`
  ).address;

  const txn = tornadoRouter.methods.withdraw(
    tornadoInstanceAddress,
    proof,
    ...args
  );

  const gasLimit = await txn.estimateGas({ from });
  const txnOutput = await txn.send({
    from,
    gasLimit: new BigNumber(gasLimit).times("1.05").toFixed(0),
    gasPrice: new BigNumber(await web3.eth.getGasPrice())
      .times("1.1")
      .toFixed(0),
  });

  return {
    transactionHash: txnOutput.transactionHash,
  };
}

/**
 * Validates if a deposit note is in the correct format
 * @param depositNote - The deposit note to validate
 * @returns true if valid, false otherwise
 */
export function isValidDepositNote(depositNote: string): boolean {
  return noteRegex().test(depositNote);
}

/**
 * Gets available deposit amounts for a currency on a network
 * @param web3 - Web3 instance
 * @param currency - The currency to check
 * @returns Array of available amounts
 */
export async function getAvailableDepositAmounts(
  web3: Web3,
  currency: string
): Promise<string[]> {
  const netId = await web3.eth.net.getId();
  const networkConfig = config.tornadoDeployments[`netId${netId}`];

  if (!networkConfig || !networkConfig[currency]) {
    throw new Error(`Currency ${currency} not supported on network ${netId}`);
  }

  const instanceAddress = networkConfig[currency].instanceAddress;
  return Object.keys(instanceAddress).sort((a, b) =>
    new BigNumber(a).minus(b).toNumber()
  );
}

/**
 * Gets supported currencies for the current network
 * @param web3 - Web3 instance
 * @returns Array of supported currency symbols
 */
export async function getSupportedCurrencies(web3: Web3): Promise<string[]> {
  const netId = await web3.eth.net.getId();
  const networkConfig = config.tornadoDeployments[`netId${netId}`];

  if (!networkConfig) {
    throw new Error(`Network ${netId} not supported`);
  }

  return Object.keys(networkConfig).filter(
    (key) =>
      typeof networkConfig[key] === "object" &&
      networkConfig[key].instanceAddress
  );
}
