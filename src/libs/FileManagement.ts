import path from "path";
import { createReadStream } from "fs";
import { access, writeFile, mkdir, readFile, readdir } from "fs/promises";

export default function FileManagement() {
  return {
    getLocalFileStream(filePath: string) {
      return createReadStream(filePath);
    },

    async getLocalFile(filePath: string, encoding?: BufferEncoding) {
      return readFile(filePath, { encoding });
    },

    async readDir(dirPath: string) {
      return readdir(dirPath);
    },

    async writeFile(filePath: string, contents: any) {
      return writeFile(filePath, contents);
    },

    async checkAndCreateDirectoryOrFile(
      filepath: string,
      isFile: boolean = false,
      fileContents: any = JSON.stringify([])
    ): Promise<boolean> {
      try {
        if (isFile && !(await this.doesFileExist(filepath))) {
          // Since all files should hold JSON that will be large arrays,
          // initialize the file with an empty array
          await writeFile(filepath, fileContents);
        } else if (!(await this.doesDirectoryExist(filepath))) {
          await mkdir(filepath, { recursive: true });
        }

        return true;
      } catch (err: unknown) {
        if (err instanceof Error && "code" in err && err.code === "EEXIST") {
          return true;
        }
        throw err;
      }
    },

    async doesDirectoryExist(filePath: string): Promise<boolean> {
      return await this.doesDirOrFileExist(filePath);
    },

    async doesFileExist(filePath: string): Promise<boolean> {
      return await this.doesDirOrFileExist(filePath);
    },

    async doesDirOrFileExist(filePath: string): Promise<boolean> {
      try {
        await access(filePath);
        return true;
      } catch (e: any) {
        if (e.code === "ENOENT") {
          return false;
        } else {
          throw e;
        }
      }
    },

    createNewFileName(
      filePath: string,
      extraText: number | string = Date.now()
    ): string {
      const pathSplit = filePath.split("/");
      const encodedFileName = encodeURIComponent(
        pathSplit[pathSplit.length - 1]
      );
      const finalFilename = `${encodedFileName
        .split(".")
        .slice(0, -1)
        .join(".")}_${extraText}${path.extname(encodedFileName)}`;
      return `${pathSplit
        .slice(0, pathSplit.length - 1)
        .join("/")}/${finalFilename}`;
    },
  };
}
