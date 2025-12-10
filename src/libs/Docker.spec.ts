import assert from "assert";
import fs from "fs";
import path from "path";
import { bufferToStream, streamToBuffer } from "./Docker";

describe("streamToBuffer", function () {
  it("should convert a Readable stream to a buffer", async function () {
    const buffer = Buffer.from("I'm lance", "utf-8");
    const readable = bufferToStream(buffer);
    const sameBuffer = await streamToBuffer(readable);
    assert.strictEqual(true, sameBuffer instanceof Buffer);
    assert.strictEqual(sameBuffer.toString("utf-8"), buffer.toString("utf-8"));
  });

  it("should convert a file system Readable stream to a buffer", async function () {
    const readable = fs.createReadStream(path.join(__dirname, "Docker.ts"));
    const buffer = await streamToBuffer(readable);
    assert.strictEqual(true, buffer instanceof Buffer);
  });
});
