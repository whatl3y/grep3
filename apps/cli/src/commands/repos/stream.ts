import axios from "axios";
import config from "../../config";

export default {
  name: "stream",
  description: "Stream the latest execution output for a repository",
  async action(address: string, repoName: string) {
    try {
      const response = await axios.get(
        `${config.execApiUrl}/${address}/${repoName}`,
        {
          responseType: "stream",
        }
      );

      response.data.on("data", (chunk: Buffer) => {
        process.stdout.write(chunk);
      });

      response.data.on("end", () => {
        console.log("\n\nStream completed.");
      });

      response.data.on("error", (err: Error) => {
        console.error(`Stream error: ${err.message}`);
        process.exit(1);
      });
    } catch (err: any) {
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
