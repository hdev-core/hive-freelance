import { Router } from "express";
import { z } from "zod";
import { assertDbConnection } from "@hive-freelance/db";
import {
  agentKeyRef,
  buildCustomJsonDemo,
  createChain,
  createHafReadStore,
  createKmsSigner,
  isHafConfigured,
} from "@hive-freelance/hive";
import { AppError, asyncHandler } from "../lib/errors.js";

export const healthRouter = Router();

function waxDemoEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_AUTH_ROUTES === "true"
  );
}

healthRouter.get("/health", async (_req, res, next) => {
  try {
    const dbOk = await assertDbConnection()
      .then(() => true)
      .catch(() => false);
    res.json({
      ok: dbOk,
      service: "api",
      db: dbOk ? "up" : "down",
      agentAccount: process.env.AGENT_ACCOUNT ?? null,
      kmsMode: process.env.KMS_MODE ?? "local",
    });
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/api/v1/health/hive", async (_req, res, next) => {
  try {
    const chain = await createChain();
    const props = await chain.getDynamicGlobalProperties();
    const kms = createKmsSigner();
    const keyRef = agentKeyRef();
    const agentKeyPresent = await kms.hasKey(keyRef).catch(() => false);

    res.json({
      ok: true,
      apiNode: chain.apiNode,
      headBlock: props.head_block_number,
      lastIrreversibleBlock: props.last_irreversible_block_num,
      waxLoaded: chain.wax !== null,
      agentKeyConfigured: agentKeyPresent,
    });

    await chain.close();
  } catch (err) {
    next(err);
  }
});

/**
 * Milestone 1 Phase D — HAF projection health (SQL over HAF_DATABASE_URL).
 * Not the interim listener / hive_records path.
 */
healthRouter.get(
  "/api/v1/health/haf",
  asyncHandler(async (_req, res) => {
    if (!isHafConfigured()) {
      throw new AppError(
        503,
        "HAF_DATABASE_URL is not configured",
        "HAF_NOT_CONFIGURED",
      );
    }

    const store = createHafReadStore();
    try {
      const ping = await store.ping();
      res.json({
        ok: ping.ok,
        source: "haf",
        accountCount: ping.accountCount,
        operationCount: ping.operationCount,
      });
    } catch (err) {
      throw new AppError(
        503,
        err instanceof Error ? err.message : "HAF unavailable",
        "HAF_UNAVAILABLE",
      );
    }
  }),
);

/**
 * Milestone 1 Phase C — WAX-built custom_json demo (mock by default).
 * Requires ENABLE_DEV_AUTH_ROUTES=true and non-production NODE_ENV.
 */
healthRouter.post(
  "/api/v1/health/wax-custom-json-demo",
  asyncHandler(async (req, res) => {
    if (!waxDemoEnabled()) {
      throw new AppError(
        404,
        "WAX demo disabled — set ENABLE_DEV_AUTH_ROUTES=true (non-production)",
        "WAX_DEMO_DISABLED",
      );
    }
    const body = z
      .object({
        account: z.string().min(1).optional(),
        note: z.string().max(200).optional(),
      })
      .parse(req.body ?? {});

    const result = await buildCustomJsonDemo({
      account: body.account,
      note: body.note,
    });
    res.json({ ok: true, ...result });
  }),
);
