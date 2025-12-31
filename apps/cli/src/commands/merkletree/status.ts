import axios from "axios";
import config from "../../config";

export default {
  name: "status",
  description: "Check the status of a merkle tree generation job",
  async action(uuid: string) {
    try {
      if (!uuid) {
        console.error("Error: Job UUID is required");
        console.error("Usage: grep3 merkletree status <uuid>");
        process.exit(1);
      }

      console.log(`Checking status for job: ${uuid}...`);

      const response = await axios.get(
        `${config.merkletreeApiUrl}/status/${uuid}`
      );

      const { status, root_hash, error, message } = response.data;

      console.log(`\nJob Status: ${status}`);

      if (root_hash) {
        console.log(`Root Hash: ${root_hash}`);
        console.log(
          `\nGet proof with: grep3 merkletree proof ${root_hash} <unique_id>`
        );
      }

      if (error) {
        console.log(`Error: ${error}`);
      }

      if (message) {
        console.log(`Message: ${message}`);
      }

      // Exit with error code if job failed
      if (status === "failed" || status === "not_found") {
        process.exit(1);
      }
    } catch (err: any) {
      console.error("Error checking job status:");
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
