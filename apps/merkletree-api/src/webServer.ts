import express, { Express } from "express";
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

// app.get("/", (req, res) => {
//   res.json({
//     service: "Merkle Tree API",
//     version: "0.0.1",
//     endpoints: {
//       "POST /generate/raw": "Generate merkle tree from raw array data",
//       "POST /generate/file": "Generate merkle tree from CSV file",
//       "GET /status/:uuid": "Check job status",
//       "GET /proof/:root_hash/:unique_id": "Get proof for specific leaf",
//     },
//   });
// });

// Start server
const port = config.server.port;
app.listen(port, () => {
  log.info(`Merkle Tree API server listening on port ${port}`);
  log.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
