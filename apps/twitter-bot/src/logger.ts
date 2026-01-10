import bunyan, { LoggerOptions } from "bunyan";
import config from "./config";

const loggerOptions: LoggerOptions = {
  name: config.appName,
  level: (process.env.LOG_LEVEL || "info") as bunyan.LogLevel,
  streams: [
    {
      stream: process.stdout,
    },
  ],
};

export default bunyan.createLogger(loggerOptions);
