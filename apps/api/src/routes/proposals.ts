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
  getAcceptCustomJson,
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
    // Same page/limit query contract as GET /jobs (routes/jobs.ts).
    const result = await listProposalsForJob(param(req, "id"), req.user!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
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

/**
 * .multipleOf(0.01) is too strict here: it's driven by how many decimal
 * digits the float's own string representation has, so a clean 2-decimal
 * sum that lands on something like 5116.789999999999 due to float addition
 * gets rejected even though it's really a real cent value. An exact
 * round-trip check (`Math.round(v*100)/100 === v`) is *also* too strict —
 * float representation noise means even values the client already rounded
 * can fail exact equality — so this allows a tight epsilon around the
 * nearest cent instead, then normalizes to that exact cent value. Genuine
 * sub-cent precision (e.g. 100.005) is still rejected: its distance from
 * the nearest cent is far larger than the epsilon.
 */
const centsAmount = z
  .number()
  .positive()
  .max(99_999_999.99)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: "Amount must not have more than 2 decimal places",
  })
  .transform((v) => Math.round(v * 100) / 100);

const proposalMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  amount: centsAmount,
  duration: z.string().min(1).max(50),
});

// A character-count cap (the original approach here) doesn't protect
// against multi-byte UTF-8: 60,000 CJK characters is ~180KB, three times
// over express.json()'s 100KB *byte* default on the whole request body
// (index.ts) — well past that limit despite being far under a 100,000-char
// cap. Bounding on Buffer.byteLength instead, at 50,000 bytes (half the
// body-parser ceiling, leaving headroom for the rest of the payload —
// milestones, portfolio_links, etc.), means an oversized cover_letter gets
// a specific, actionable 400 from Zod before it has any chance of tripping
// body-parser's blunt whole-request 413.
const MAX_COVER_LETTER_BYTES = 50_000;
const coverLetterSchema = z
  .string()
  .min(1)
  .refine((v) => Buffer.byteLength(v, "utf8") <= MAX_COVER_LETTER_BYTES, {
    message: `cover_letter must not exceed ${MAX_COVER_LETTER_BYTES} bytes (UTF-8)`,
  });

export const submitProposalBodySchema = z.object({
  cover_letter: coverLetterSchema,
  bid_amount: centsAmount,
  estimated_duration: z.string().max(50).nullable().optional(),
  available_to_start: z.string().max(50).nullable().optional(),
  portfolio_links: z.array(portfolioLinkSchema).max(10).nullable().optional(),
  milestones: z.array(proposalMilestoneSchema).min(1).max(20),
});

jobProposalsRouter.post(
  "/",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const body = submitProposalBodySchema.parse(req.body);
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

proposalsRouter.get(
  "/:id/accept/custom-json",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const result = await getAcceptCustomJson(param(req, "id"), req.user!.id);
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
