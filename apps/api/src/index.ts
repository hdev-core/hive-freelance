import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { closePrisma } from "@hive-freelance/db";
import { closeHafPool, closeHiveChain } from "@hive-freelance/hive";
import { errorHandler } from "./lib/errors.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { jobsRouter } from "./routes/jobs.js";
import {
  jobProposalsRouter,
  proposalsRouter,
} from "./routes/proposals.js";
import { contractsRouter } from "./routes/contracts.js";
import { milestonesRouter } from "./routes/milestones.js";
import { paymentsRouter } from "./routes/payments.js";
import { stubsRouter } from "./routes/stubs.js";
import { hiveRouter } from "./routes/hive.js";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadEnv({ path: resolve(rootDir, ".env") });

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use(healthRouter);

const v1 = express.Router();
// Every response here is per-session or otherwise dynamic (auth/me,
// profiles, job/proposal state) — without this, a GET can be served from
// the browser's HTTP cache after a cookie changes (e.g. logging into a
// different account), since the URL alone doesn't vary. no-store forces a
// real request every time.
v1.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
v1.use("/auth", authRouter);
v1.use("/users", usersRouter);
v1.use("/hive", hiveRouter);
v1.use("/jobs", jobsRouter);
v1.use("/jobs/:id/proposals", jobProposalsRouter);
v1.use("/proposals", proposalsRouter);
v1.use("/contracts", contractsRouter);
v1.use("/milestones", milestonesRouter);
v1.use("/payments", paymentsRouter);
v1.use(stubsRouter);

app.use("/api/v1", v1);

app.use(errorHandler);

const server = app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await closePrisma();
  await closeHafPool();
  await closeHiveChain();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
