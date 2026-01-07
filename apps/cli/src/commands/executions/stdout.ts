import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";
import ora from "ora";
import config from "../../config";

export default {
  name: "stdout",
  description: "Stream stdout output from an execution to a temporary file",
  async action(id: string) {
    const spinner = ora("Fetching execution stdout...").start();

    // Create a temporary file
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `grep3-execution-${id}-stdout.txt`);
    const writeStream = fs.createWriteStream(tmpFile);

    try {
      const response = await axios.get(
        `${config.execApiUrl}/executions/${id}/stdout`,
        {
          responseType: "stream",
        }
      );

      spinner.text = "Streaming stdout to file...";

      response.data.pipe(writeStream);

      response.data.on("end", () => {
        writeStream.end();
      });

      response.data.on("error", (err: Error) => {
        spinner.fail(`Stream error: ${err.message}`);
        writeStream.close();
        process.exit(1);
      });

      writeStream.on("finish", () => {
        spinner.succeed("Stream completed successfully!");
        console.log(`\nOutput saved to: ${tmpFile}`);
      });

      writeStream.on("error", (err: Error) => {
        spinner.fail(`File write error: ${err.message}`);
        process.exit(1);
      });
    } catch (err: any) {
      spinner.fail("Failed to fetch stdout");
      writeStream.close();

      if (err.response) {
        console.error(
          `Error: ${err.response.status} - ${err.response.data}`
        );
      } else {
        console.error(`Error: ${err.message}`);
      }
      process.exit(1);
    }
  },
};
