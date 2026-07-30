import { Router } from "express";
import { z } from "zod";
import {
  createHafReadStore,
  isHafConfigured,
} from "@hive-freelance/hive";
import { AppError, asyncHandler } from "../lib/errors.js";
import { normalizeHiveUsername } from "../lib/hiveAuth.js";

export const hiveRouter = Router();

hiveRouter.get(
  "/accounts/:name",
  asyncHandler(async (req, res) => {
    if (!isHafConfigured()) {
      throw new AppError(
        503,
        "HAF_DATABASE_URL is not configured",
        "HAF_NOT_CONFIGURED",
      );
    }

    const name = normalizeHiveUsername(String(req.params.name ?? ""));
    if (!name) {
      throw new AppError(400, "Hive username required", "VALIDATION");
    }

    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .parse(req.query.limit ?? 20);

    const store = createHafReadStore();
    try {
      const account = await store.getAccount(name);
      if (!account) {
        throw new AppError(404, `Account @${name} not found in HAF`, "NOT_FOUND");
      }
      const operations = await store.getRecentAccountOps(name, limit);
      res.json({
        source: "haf",
        account,
        operations,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        503,
        err instanceof Error ? err.message : "HAF read failed",
        "HAF_UNAVAILABLE",
      );
    } finally {
      await store.close().catch(() => undefined);
    }
  }),
);
