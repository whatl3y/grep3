import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import apiRoutes from "./routes/api";
import config from "./config";
import log from "./logger";
import { closeBrowser } from "./libs/Browser";
import { sessionStore } from "./libs/SessionStore";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    log.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// API routes
app.use("/api", apiRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: config.appName });
});

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));

  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Error handling
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    log.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// Start server
const server = app.listen(config.server.port, () => {
  log.info(`${config.appName} server running on port ${config.server.port}`);
  log.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful shutdown
async function shutdown() {
  log.info("Shutting down...");

  server.close(() => {
    log.info("HTTP server closed");
  });

  await closeBrowser();
  sessionStore.shutdown();

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
