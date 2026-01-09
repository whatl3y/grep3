import bunyan, { LoggerOptions } from "bunyan";
import config from "./config";

const loggerOptions: LoggerOptions = <LoggerOptions>{
  name: config.appName,
  level: process.env.LOG_LEVEL || "info",
  streams: [
    {
      stream: process.stdout,
    },
  ],
};

export default bunyan.createLogger(loggerOptions);
