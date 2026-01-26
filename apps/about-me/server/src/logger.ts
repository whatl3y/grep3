import bunyan from "bunyan";
import config from "./config";

const log = bunyan.createLogger({
  name: config.appName,
  level: (process.env.LOG_LEVEL as bunyan.LogLevel) || "info",
});

export default log;
