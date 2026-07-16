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
  acceptProposal,
  confirmAccept,
  listProposalsForJob,
  rejectProposal,
  submitProposal,
  withdrawProposal,
} from "../services/proposals.js";

export const proposalsRouter = Router();

/** Nested under /jobs/:id/proposals — mount separately */
export const jobProposalsRouter = Router({ mergeParams: true });

jobProposalsRouter.get(
  "/",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const rows = await listProposalsForJob(param(req, "id"), req.user!.id);
    res.json({ items: rows });
  }),
);

jobProposalsRouter.post(
  "/",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        cover_letter: z.string().min(1),
        bid_amount: z.number().positive(),
      })
      .parse(req.body);
    const proposal = await submitProposal(param(req, "id"), req.user!.id, body);
    res.status(201).json(proposal);
  }),
);

proposalsRouter.delete(
  "/:id",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    await withdrawProposal(param(req, "id"), req.user!.id);
    res.status(204).send();
  }),
);

proposalsRouter.post(
  "/:id/accept",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const result = await acceptProposal(param(req, "id"), req.user!.id);
    res.json(result);
  }),
);

proposalsRouter.patch(
  "/:id/accept/confirm",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = z.object({ hive_tx_id: z.string().min(1) }).parse(req.body);
    const contract = await confirmAccept(
      param(req, "id"),
      req.user!.id,
      body.hive_tx_id,
    );
    res.json(contract);
  }),
);

proposalsRouter.post(
  "/:id/reject",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const proposal = await rejectProposal(param(req, "id"), req.user!.id);
    res.json(proposal);
  }),
);
