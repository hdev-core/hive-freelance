import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors.js";
import { param } from "../lib/params.js";
import { requireAuth, requireClient } from "../middleware/auth.js";
import {
  cancelContract,
  completeContract,
  getContract,
  listContracts,
} from "../services/contracts.js";
import {
  createMilestone,
  listMilestones,
} from "../services/milestones.js";
import {
  fundMilestone,
  listPayments,
} from "../services/payments.js";

export const contractsRouter = Router();

contractsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await listContracts(req.user!.id);
    res.json({ items });
  }),
);

contractsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await getContract(param(req, "id"), req.user!.id);
    res.json(contract);
  }),
);

contractsRouter.post(
  "/:id/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await completeContract(param(req, "id"), req.user!.id);
    res.json(contract);
  }),
);

contractsRouter.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await cancelContract(param(req, "id"), req.user!.id);
    res.json(contract);
  }),
);

contractsRouter.get(
  "/:id/milestones",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await listMilestones(param(req, "id"), req.user!.id);
    res.json({ items });
  }),
);

contractsRouter.post(
  "/:id/milestones",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        amount: z.number().positive(),
        milestone_order: z.number().int().positive(),
      })
      .parse(req.body);
    const milestone = await createMilestone(
      param(req, "id"),
      req.user!.id,
      body,
    );
    res.status(201).json(milestone);
  }),
);

contractsRouter.get(
  "/:id/payments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await listPayments(param(req, "id"), req.user!.id);
    res.json({ items });
  }),
);

contractsRouter.post(
  "/:id/milestones/:mid/fund",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        currency: z.enum(["HBD", "HIVE"]).optional(),
      })
      .parse(req.body ?? {});
    const result = await fundMilestone(
      param(req, "id"),
      param(req, "mid"),
      req.user!.id,
      body.currency ?? "HBD",
    );
    res.status(201).json(result);
  }),
);
