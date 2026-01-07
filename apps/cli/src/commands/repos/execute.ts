import axios from "axios";
import config from "../../config";

export default {
  name: "execute",
  description: "Execute a repository (queues Docker job)",
  async action(id: string) {
    try {
      const response = await axios.post(
        `${config.execApiUrl}/repos/${id}/execute`
      );
      console.log(JSON.stringify(response.data, null, 2));
      console.log(
        `\nExecution queued successfully. Use "grep3 executions get ${response.data.execution.id}" to check status.`
      );
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
