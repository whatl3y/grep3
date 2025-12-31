import crypto from "crypto";
import BigNumber from "bignumber.js";

// import { buildPedersenHash } from 'circomlibjs'
const { buildPedersenHash } = require("circomlibjs");
// import snarkjs from 'snarkjs'
const snarkjs = require("snarkjs");

const bigInt = snarkjs.bigInt;

type PromiseFunction = () => Promise<any>;
type NOOP = (err: Error, attempt: number) => {};

export async function sleep(milliseconds = 1000) {
  return await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function exponentialBackoff(
  promiseFunction: PromiseFunction,
  failureFunction?: NOOP,
  err?: Error,
  totalAllowedBackoffTries: number = 8,
  backoffAttempt: number = 1
): Promise<any> {
  const backoffSecondsToWait = 2 + Math.pow(backoffAttempt, 2);

  if (backoffAttempt > totalAllowedBackoffTries) throw err;

  try {
    const result = await promiseFunction();
    return result;
  } catch (err: any) {
    if (failureFunction) failureFunction(err, backoffAttempt);
    await sleep(backoffSecondsToWait * 1000);
    return await exponentialBackoff(
      promiseFunction,
      failureFunction,
      err,
      totalAllowedBackoffTries,
      backoffAttempt + 1
    );
  }
}


/** Generate random number of specified byte length */
export function rbigint(nbytes: number) {
  return snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes));
}

/** Compute pedersen hash */
export async function pedersenHash(data: any): Promise<string> {
  const pedersenHash = await buildPedersenHash();
  const babyJub = pedersenHash.babyJub;
  const [hash] = babyJub.unpackPoint(pedersenHash.hash(data));
  return babyJub.F.toString(hash);
}

/** BigNumber to hex string of specified length */
export function toHex(number: Buffer | number | string, length = 32) {
  const str =
    number instanceof Buffer
      ? number.toString("hex")
      : bigInt(number).toString(16);
  return `0x${str.padStart(length * 2, "0")}`;
}

/** Remove Decimal without rounding with BigNumber */
export function rmDecimalBN(bigNum: BigNumber | number | string, decimals = 6) {
  return new BigNumber(bigNum)
    .times(new BigNumber(10).pow(decimals))
    .integerValue(BigNumber.ROUND_DOWN)
    .div(new BigNumber(10).pow(decimals))
    .toNumber();
}

export function fromDecimals(
  amount: number | string | BigNumber,
  decimals: number = 18
) {
  amount = amount.toString();
  let ether = amount.toString();
  const base = new BigNumber("10").pow(new BigNumber(decimals));
  const baseLength = base.toString(10).length - 1 || 1;

  const negative = ether.substring(0, 1) === "-";
  if (negative) {
    ether = ether.substring(1);
  }

  if (ether === ".") {
    throw new Error(
      "[ethjs-unit] while converting number " +
        amount +
        " to wei, invalid value"
    );
  }

  // Split it into a whole and fractional part
  const comps = ether.split(".");
  if (comps.length > 2) {
    throw new Error(
      "[ethjs-unit] while converting number " +
        amount +
        " to wei,  too many decimal points"
    );
  }

  let whole = comps[0];
  let fraction = comps[1];

  if (!whole) {
    whole = "0";
  }
  if (!fraction) {
    fraction = "0";
  }
  if (fraction.length > baseLength) {
    throw new Error(
      "[ethjs-unit] while converting number " +
        amount +
        " to wei, too many decimal places"
    );
  }

  while (fraction.length < baseLength) {
    fraction += "0";
  }

  const wholeBN = new BigNumber(whole);
  const fractionBN = new BigNumber(fraction);
  let wei = wholeBN.times(base).plus(fractionBN);

  if (negative) {
    wei = wei.times(-1);
  }

  return new BigNumber(wei.toString(10), 10);
}

export function toDecimals(
  value: BigNumber | number | string,
  decimals: number | string,
  fixed: number
) {
  const zero = new BigNumber(0);
  const negative1 = new BigNumber(-1);
  decimals = decimals || 18;
  fixed = fixed || 7;

  value = new BigNumber(value);
  const negative = value.lt(zero);
  const base = new BigNumber("10").pow(new BigNumber(decimals));
  const baseLength = base.toString(10).length - 1 || 1;

  if (negative) {
    value = value.times(negative1);
  }

  let fraction: string = `${value.mod(base).toString(10)}`;
  while (fraction.length < baseLength) {
    fraction = `0${fraction}`;
  }
  const matches = fraction.match(/^([0-9]*[1-9]|0)(0*)/);
  if (matches && matches.length > 1 && typeof matches[1] === "string") {
    fraction = matches[1];
  }

  const whole = value.div(base).toString(10);
  value = `${whole}${fraction === "0" ? "" : `.${fraction}`}`;

  if (negative) {
    value = `-${value}`;
  }

  if (fixed) {
    value = value.slice(0, fixed);
  }

  return value;
}

