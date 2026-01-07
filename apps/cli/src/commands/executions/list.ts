import axios from "axios";
import config from "../../config";

export default {
  name: "list",
  description: "List all executions for a repository",
  async action(repoId: string) {
    try {
      const response = await axios.get(
        `${config.execApiUrl}/executions/${repoId}/all`
      );
      console.log(JSON.stringify(response.data, null, 2));
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
