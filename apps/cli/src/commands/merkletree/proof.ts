import axios from "axios";
import config from "../../config";

export default {
  name: "proof",
  description: "Get the merkle proof for a specific leaf",
  async action(rootHash: string, uniqueId: string) {
    try {
      if (!rootHash || !uniqueId) {
        console.error("Error: Both root_hash and unique_id are required");
        console.error("Usage: grep3 merkletree proof <root_hash> <unique_id>");
        process.exit(1);
      }

      console.log(`Fetching proof for:`);
      console.log(`  Root Hash: ${rootHash}`);
      console.log(`  Unique ID: ${uniqueId}`);

      const response = await axios.get(
        `${config.merkletreeApiUrl}/proof/${rootHash}/${uniqueId}`
      );

      const { root_hash, unique_id, values, proof } = response.data;

      console.log(`\nProof found successfully!`);
      console.log(`Root Hash: ${root_hash}`);
      console.log(`Unique ID: ${unique_id}`);
      console.log(`\nValues:`);
      console.log(JSON.stringify(values, null, 2));
      console.log(`\nProof:`);
      console.log(JSON.stringify(proof, null, 2));
    } catch (err: any) {
      console.error("Error fetching proof:");
      if (err.response) {
        if (err.response.status === 404) {
          console.error(
            "Proof not found for the given root_hash and unique_id"
          );
        } else {
          console.error(
            `API Error: ${err.response.data.error || err.response.statusText}`
          );
        }
      } else {
        console.error(err.message);
      }
      process.exit(1);
    }
  },
};
