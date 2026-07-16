import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { closePool } from "@hive-freelance/db";
import { healthRouter } from "./routes/health.js";
import { stubRouter } from "./routes/stubs.js";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadEnv({ path: resolve(rootDir, ".env") });
loadEnv({ path: resolve(rootDir, ".env.example") });

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(healthRouter);
app.use("/api/v1", stubRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  },
);

const server = app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
