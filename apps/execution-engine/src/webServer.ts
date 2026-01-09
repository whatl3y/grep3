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
        log.error("Error rendering README:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.listen(config.server.port, () =>
      log.info(`listening on *:${config.server.port}`)
    );
  } catch (err) {
    log.error("Server startup error:", err);
    process.exit(1);
  }
})();
