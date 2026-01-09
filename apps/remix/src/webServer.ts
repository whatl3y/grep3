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

    // Serve a simple favicon.ico
    app.get("/favicon.ico", (_, res) => {
      // Simple 16x16 8-bit style favicon (base64 encoded)
      // This is a tiny pixel art icon with a retro game controller style
      const favicon = Buffer.from(
        "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A/+8A//7vAP/+7wD//u8A//7vAP/+7wD//u8A/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP/+7wD//u8A//7vAP/+7wD//u8A//7vAP/+7wD//u8A/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP/+7wD//u8A//AAAP8AAAD//u8A//7vAP/+7wD//u8A/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP/+7wD//u8A//7vAP/+7wD//u8A//7vAP/+7wD//u8A/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP/wAAD/8AAA//AAAP/wAAD/8AAA//AAAP/wAAD/8AAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "base64"
      );
      res.setHeader("Content-Type", "image/x-icon");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.send(favicon);
    });

    // Present README on home page
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

    // Bind all other routes (including wildcard)
    bindRoutes(app);

    app.listen(config.server.port, () =>
      log.info(`listening on *:${config.server.port}`)
    );
  } catch (err) {
    log.error("Server startup error:", err);
    process.exit(1);
  }
})();
