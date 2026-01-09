import express, { Express } from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { db } from "@grep3/core";
import log from "./logger";
import redis from "./redis";
import config from "./config";
import routes from "./routes";

dotenv.config();

const app: Express = express();

// Middleware
app.set("x-powered-by", false);
app.set("trust proxy", true);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
const apiRoutes = routes({ db, log, redis });

app.use("/generate", apiRoutes.generate);
app.use("/status", apiRoutes.status);
app.use("/proof", apiRoutes.proof);

// Landing page
app.get("/", (_req, res) => {
  const templatePath = path.join(__dirname, "..", "templates", "index.html");
  fs.readFile(templatePath, "utf8", (err, html) => {
    if (err) {
      log.error("Error reading index.html template:", err);
      return res.status(500).json({ error: "Failed to load landing page" });
    }
    // Replace template placeholder with actual host
    const renderedHtml = html.replace(/\{\{HOST\}\}/g, config.server.host);
    res.type("html").send(renderedHtml);
  });
});

// Start server
const port = config.server.port;
app.listen(port, () => {
  log.info(`Merkle Tree API server listening on port ${port}`);
  log.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
