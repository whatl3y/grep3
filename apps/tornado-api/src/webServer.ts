import dotenv from "dotenv";
import express from "express";
import path from "path";
import { Markdown } from "@grep3/core";
import config from "./config";
import log from "./logger";
import bindRoutes from "./routes";

dotenv.config({ quiet: true });

(async function webServer() {
  try {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);

    // Parse JSON bodies
    app.use(express.json());

    bindRoutes(app);

    // present README on home page
    app.get("/", async (_, res) => {
      try {
        res.send(
          await Markdown.convertFileToHtml(
            path.join(__dirname, "..", "README.md")
          )
        );
      } catch (err: any) {
        res.status(500).send(err.stack);
      }
    });

    app.listen(config.server.port, () =>
      log.info(`Tornado API listening on *:${config.server.port}`)
    );
  } catch (err) {
    console.error(err);
    process.exit();
  }
})();
