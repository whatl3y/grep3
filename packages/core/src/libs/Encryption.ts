import crypto from "crypto";
import { createReadStream } from "fs";
import { readFile } from "fs/promises";
import { promisify } from "util";
import * as zlib from "zlib";

const inflate = promisify(zlib.inflate);
const deflate = promisify(zlib.deflate);

interface IEncryptionOptions {
  secret: string;
  algorithm?: string;
}

export default function Encryption(options: IEncryptionOptions) {
  const alg = options.algorithm || "aes-256-ctr";
  const sec = options.secret;

  return {
    _algorithm: alg,
    _secret: sec,

    async encrypt(input: Buffer | string) {
      const secret = getFilledSecret(this._secret);
      const { iv, key } = getKeyAndIV(secret);
      const cipher = crypto.createCipheriv(this._algorithm, key, iv);

      const inputStr: string =
        input instanceof Buffer ? input.toString("base64") : `${input}`;
      let cipherText = cipher.update(inputStr, "utf8", "base64");
      cipherText += cipher.final("base64");
      return this.parseData(`${cipherText}:${iv.toString("base64")}`);
    },

    async encryptFileUtf8(filePath: string) {
      const fileText = await readFile(filePath, { encoding: "utf8" });
      return this.encrypt(fileText);
    },

    async decrypt(text: string) {
      const inflatedString = (await this.parseData(text, false)).toString();
      const [rawBase64, ivBase64] = inflatedString.split(":");
      const iv = Buffer.from(ivBase64, "base64");
      const secret = getFilledSecret(this._secret);
      const { key } = getKeyAndIV(secret, iv);
      const decipher = crypto.createDecipheriv(this._algorithm, key, iv);

      let dec = decipher.update(rawBase64, "base64", "utf8");
      dec += decipher.final("utf8");
      return dec;
    },

    async decryptFileUtf8(filePath: string) {
      const fileText = await readFile(filePath, { encoding: "utf8" });
      return this.decrypt(fileText);
    },

    async fileToHash(filePath: string): Promise<string> {
      return new Promise((resolve, reject) => {
        const sha256Sum = crypto.createHash("sha256");

        const s = createReadStream(filePath);
        s.on("data", (data) => sha256Sum.update(data));
        s.on("error", reject);
        s.on("end", () => resolve(sha256Sum.digest("base64")));
      });
    },

    // If inflating, we will always return a raw Buffer. If deflating,
    // we return a base64 encoded string.
    async parseData(
      value: string,
      isRawData: boolean = true
    ): Promise<Buffer | string> {
      if (isRawData) {
        const compressedValue = await deflate(value);
        return Buffer.from(compressedValue).toString("base64");
      }

      return inflate(Buffer.from(value, "base64"));
    },
  };
}

// Private methods
function getFilledSecret(secret: string): string {
  const sha256Sum = crypto.createHash("sha256");
  sha256Sum.update(secret);
  return sha256Sum.digest("base64");
}

function getKeyAndIV(key: string, iv?: Buffer) {
  const ivBuffer = iv || crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(key, ivBuffer, 1e5, 32, "sha256");
  return {
    iv: ivBuffer,
    key: derivedKey,
  };
}
