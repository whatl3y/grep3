import path from "path";
import { createReadStream } from "fs";
import { stat, writeFile, mkdir, readFile, readdir } from "fs/promises";

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
      return this.doesDirOrFileExist(filePath, "isDirectory");
    },

    async doesFileExist(filePath: string): Promise<boolean> {
      return this.doesDirOrFileExist(filePath, "isFile");
    },

    async doesDirOrFileExist(
      filePath: string,
      method: "isDirectory" | "isFile"
    ): Promise<boolean> {
      try {
        const stats = await stat(filePath);
        return stats[method]();
      } catch (e) {
        return false;
      }
    },

    createNewFileName(
      fileName: string,
      extraText: number | string = Date.now()
    ): string {
      fileName = encodeURIComponent(fileName);
      return `${fileName
        .split(".")
        .slice(0, -1)
        .join(".")}_${extraText}${path.extname(fileName)}`;
    },
  };
}
