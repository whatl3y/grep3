import Docker from "dockerode";
import { Readable } from "stream";
import config from "../config";

const docker = new Docker({ host: config.docker.host });
export default docker;

export function bufferToStream(buf: Buffer): Readable {
  const readable = new Readable();
  readable._read = () => {}; // _read is required but NOOPing it
  readable.push(buf);
  readable.push(null);
  return readable;
}

export async function streamToBuffer(str: Readable): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    let data: any[] = [];
    str
      .on("error", reject)
      .on("data", (chunk) => data.push(chunk))
      .on("end", () => resolve(Buffer.concat(data)));
  });
}
