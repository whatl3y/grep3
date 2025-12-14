import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import FileManagement from "./FileManagement";
import { sleep } from "./Utils";
import config from "../config";

const fileMgmt = FileManagement();

interface IBaseOptions {
  bucket?: string;
}

interface IGetFileOptions extends IBaseOptions {
  filename: string;
  options?: any;
}

interface IWriteFileOptions extends IBaseOptions {
  filename: string;
  data: Buffer | Readable | string;
  exactFilename?: boolean;
}

export default function Aws(region: string = "us-east-1") {
  const accessKeyId = config.aws.accessKey;
  const secretAccessKey = config.aws.secretAccessKey;

  const s3Client = new S3Client({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
  });

  return {
    s3: s3Client,
    defaultBucket: config.aws.bucket,

    async doesFileExist(options: IGetFileOptions): Promise<boolean> {
      const filename = options.filename;
      const bucket = options.bucket || this.defaultBucket;
      const extraOptions = options.options || {};
      const params = Object.assign(
        { Bucket: bucket, Key: filename },
        extraOptions
      );

      try {
        await this.s3.send(new HeadObjectCommand(params));
        return true;
      } catch (err: any) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
          return false;
        }
        throw err;
      }
    },

    async getFile(options: IGetFileOptions): Promise<GetObjectCommandOutput> {
      const filename = options.filename;
      const bucket = options.bucket || this.defaultBucket;
      const extraOptions = options.options || {};
      const params = Object.assign(
        { Bucket: bucket, Key: filename },
        extraOptions
      );
      // Note the raw buffer data in the file is returned as data.Body
      return await this.s3.send(new GetObjectCommand(params));
    },

    getFileStreamWithBackoff(
      streamToPipeTo: NodeJS.WritableStream,
      options: IGetFileOptions,
      backoffAttempt: number = 1
    ) {
      const totalAllowedBackoffTries = 5;
      const backoffSecondsToWait = 2 + Math.pow(backoffAttempt, 2);

      return new Promise(async (resolve, reject) => {
        const filename = options.filename;
        const bucket = options.bucket || this.defaultBucket;
        const extraOptions = options.options || {};
        const params = Object.assign(
          { Bucket: bucket, Key: filename },
          extraOptions
        );

        try {
          const response = await this.s3.send(new GetObjectCommand(params));
          const body = response.Body as Readable;
          if (!body) return reject(new Error("no AWS GetObjectCommand body"));

          // Listen for errors on the readable stream (source)
          body.on("error", async (err: Error) => {
            if (backoffAttempt > totalAllowedBackoffTries) return reject(err);

            try {
              await sleep(backoffSecondsToWait * 1000);
              await this.getFileStreamWithBackoff(
                streamToPipeTo,
                options,
                backoffAttempt + 1
              );
              resolve(null);
            } catch (e) {
              reject(e);
            }
          });

          // Listen for errors on the writable stream (destination)
          streamToPipeTo.on("error", reject);

          // Wait for the writable stream to finish processing all data
          // 'finish' is emitted when all data has been written to the destination
          streamToPipeTo.on("finish", resolve);

          // Pipe the data
          body.pipe(streamToPipeTo);
        } catch (err) {
          if (backoffAttempt > totalAllowedBackoffTries) return reject(err);

          try {
            await sleep(backoffSecondsToWait * 1000);
            await this.getFileStreamWithBackoff(
              streamToPipeTo,
              options,
              backoffAttempt + 1
            );
            resolve(null);
          } catch (e) {
            reject(e);
          }
        }
      });
    },

    /**
     * Writes a file to S3 bucket
     * @param options - Options for writing the file
     * @returns Promise with filename and S3 response data
     *
     * Supports three data types:
     * - string: Text content to upload
     * - Buffer: Binary data to upload
     * - Readable: Stream to upload (e.g., fs.createReadStream)
     *
     * All types are handled asynchronously and efficiently by AWS SDK v3
     */
    async writeFile(
      options: IWriteFileOptions
    ): Promise<{ filename: string; data: PutObjectCommandOutput }> {
      const bucket = options.bucket || this.defaultBucket;
      const data = options.data;
      const filename = !options.exactFilename
        ? fileMgmt.createNewFileName(options.filename)
        : options.filename;

      // AWS SDK v3 PutObjectCommand elegantly handles string, Buffer, and Readable stream
      const params = {
        Bucket: bucket,
        Key: filename,
        Body: data,
      };

      const returnedData = await this.s3.send(new PutObjectCommand(params));
      return { filename, data: returnedData };
    },
  };
}
