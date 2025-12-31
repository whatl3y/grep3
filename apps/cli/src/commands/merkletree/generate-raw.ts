import axios from "axios";
import config from "../../config";

export default {
  name: "generate-raw",
  description: "Generate a merkle tree from raw JSON data",
  async action(dataJson: string) {
    try {
      // Parse the input JSON
      let data;
      try {
        data = JSON.parse(dataJson);
      } catch (err) {
        console.error("Error: Invalid JSON format");
        console.error("Please provide a valid JSON array of arrays");
        process.exit(1);
      }

      if (!Array.isArray(data) || data.length === 0) {
        console.error("Error: Data must be a non-empty array of arrays");
        process.exit(1);
      }

      console.log(`Submitting ${data.length} rows to merkletree API...`);

      const response = await axios.post(
        `${config.merkletreeApiUrl}/generate/raw`,
        { data }
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
      console.error("Error generating merkle tree:");
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
