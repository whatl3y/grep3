import dotenv from "dotenv";
import express from "express";
import path from "path";
import bindRoutes from "./routes";
import config from "./config";
import log from "./logger";

dotenv.config({ quiet: true } as any);

(async function webServer() {
  try {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);

    // Set up Pug as the view engine
    app.set("view engine", "pug");
    app.set("views", path.join(__dirname, "..", "views"));

    // Serve static files
    app.use(express.static(path.join(__dirname, "..", "public")));

    // Parse JSON bodies
    app.use(express.json());

    // Bind all routes
    bindRoutes(app);

    app.listen(config.server.port, () =>
      log.info(`Twitter Bot server listening on *:${config.server.port}`)
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
