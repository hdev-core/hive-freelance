import { Router } from "express";
import { pingDb } from "@hive-freelance/db";
import { agentKeyRef, createChain, createKmsSigner } from "@hive-freelance/hive";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res, next) => {
  try {
    const dbOk = await pingDb();
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
