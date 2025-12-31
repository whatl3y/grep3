import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import config from "../../config";

export default {
  name: "generate-file",
  description: "Generate a merkle tree from a CSV file",
  async action(filePath: string) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      console.log(`Reading file: ${filePath}...`);

      const formData = new FormData();
      formData.append("file", fs.createReadStream(filePath));

      console.log("Uploading file to merkletree API...");

      const response = await axios.post(
        `${config.merkletreeApiUrl}/generate/file`,
        formData,
        {
          headers: formData.getHeaders(),
        }
      );

      if (response.data.job_uuid) {
        console.log("\nMerkle tree generation job submitted successfully!");
        console.log(`Job UUID: ${response.data.job_uuid}`);
        console.log(
          `\nCheck status with: grep3 merkletree status ${response.data.job_uuid}`
        );
      } else {
        console.error("Error: Unexpected response from API");
        console.error(JSON.stringify(response.data, null, 2));
        process.exit(1);
      }
    } catch (err: any) {
      console.error("Error generating merkle tree from file:");
      if (err.response) {
        console.error(
          `API Error: ${err.response.data.error || err.response.statusText}`
        );
      } else {
        console.error(err.message);
      }
      process.exit(1);
    }
  },
};
