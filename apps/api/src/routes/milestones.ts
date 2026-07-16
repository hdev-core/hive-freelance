import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors.js";
import { param } from "../lib/params.js";
import {
  requireAuth,
  requireClient,
  requireFreelancer,
} from "../middleware/auth.js";
import {
  approveMilestone,
  confirmApprove,
  submitMilestone,
} from "../services/milestones.js";

export const milestonesRouter = Router();

milestonesRouter.post(
  "/:id/submit",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const milestone = await submitMilestone(param(req, "id"), req.user!.id);
    res.json(milestone);
  }),
);

milestonesRouter.post(
  "/:id/approve",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const result = await approveMilestone(param(req, "id"), req.user!.id);
    res.json(result);
  }),
);

milestonesRouter.patch(
  "/:id/approve/confirm",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = z.object({ hive_tx_id: z.string().min(1) }).parse(req.body);
    const milestone = await confirmApprove(
      param(req, "id"),
      req.user!.id,
      body.hive_tx_id,
    );
    res.json(milestone);
  }),
);

milestonesRouter.post("/:id/dispute", requireAuth, (_req, res) => {
  res.status(501).json({ error: "Disputes not implemented in MVP slice" });
});
milestonesRouter.patch("/:id/dispute/confirm", requireAuth, (_req, res) => {
  res.status(501).json({ error: "Disputes not implemented in MVP slice" });
});
