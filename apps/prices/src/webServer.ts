import dotenv from "dotenv";
import express from "express";
import config from "./config";
import log from "./logger";
import bindRoutes from "./routes";

dotenv.config({ quiet: true });

(async function webServer() {
  try {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);

    bindRoutes(app);

    app.listen(config.server.port, () =>
      log.info(`listening on *:${config.server.port}`)
    );
  } catch (err) {
    console.error(err);
    process.exit();
  }
})();
