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
  listMyProposals,
  listProposalsForJob,
  rejectProposal,
  submitProposal,
  withdrawProposal,
} from "../services/proposals.js";

export const proposalsRouter = Router();

/** Nested under /jobs/:id/proposals — mount separately */
export const jobProposalsRouter = Router({ mergeParams: true });

/** The caller's own proposals across every job/status — backs "My Proposals". */
proposalsRouter.get(
  "/",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const rows = await listMyProposals(req.user!.id);
    res.json({ items: rows });
  }),
);

jobProposalsRouter.get(
  "/",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const rows = await listProposalsForJob(param(req, "id"), req.user!.id);
    res.json({ items: rows });
  }),
);

const httpUrl = z
  .string()
  .refine(
    (val) => {
      try {
        const protocol = new URL(val).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must use http or https" },
  );

const portfolioLinkSchema = z.object({
  title: z.string().min(1).max(100),
  url: httpUrl,
});

const proposalMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  duration: z.string().min(1).max(50),
});

jobProposalsRouter.post(
  "/",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        cover_letter: z.string().min(1),
        bid_amount: z.number().positive(),
        estimated_duration: z.string().max(50).nullable().optional(),
        available_to_start: z.string().max(50).nullable().optional(),
        portfolio_links: z.array(portfolioLinkSchema).max(10).nullable().optional(),
        milestones: z.array(proposalMilestoneSchema).min(1).max(20),
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
