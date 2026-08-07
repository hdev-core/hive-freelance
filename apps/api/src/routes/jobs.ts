import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../lib/errors.js";
import { param } from "../lib/params.js";
import { optionalAuth, requireAuth, requireClient } from "../middleware/auth.js";
import {
  cancelJob,
  createJob,
  deleteJob,
  getJob,
  listJobs,
  updateJob,
} from "../services/jobs.js";

export const jobsRouter = Router();

const JOB_STATUSES = ["open", "in_progress", "completed", "cancelled"] as const;
const jobStatusSchema = z.enum(JOB_STATUSES);

// Parses an optional positive-number query param (e.g. budget_min/max).
// Throws a clean 400 on garbage input instead of passing NaN through to
// Prisma, which would surface as an opaque internal error.
function positiveNumberQueryParam(
  value: unknown,
  name: string,
): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new AppError(400, `${name} must be a positive number`);
  }
  return n;
}

jobsRouter.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const budget_min = positiveNumberQueryParam(
      req.query.budget_min,
      "budget_min",
    );
    const budget_max = positiveNumberQueryParam(
      req.query.budget_max,
      "budget_max",
    );
    if (budget_min != null && budget_max != null && budget_min > budget_max) {
      throw new AppError(400, "budget_min cannot be greater than budget_max");
    }
    const client_id = req.query.client_id
      ? String(req.query.client_id)
      : undefined;
    if (client_id != null && !/^\d+$/.test(client_id)) {
      throw new AppError(400, "client_id must be a positive integer");
    }
    // client_id filter drops the open-only default (see listJobs), which
    // would otherwise let anyone enumerate a client's non-open jobs with no
    // auth at all. Require the caller to be that same client.
    if (client_id != null) {
      if (!req.user) {
        throw new AppError(401, "Authentication required", "UNAUTHORIZED");
      }
      if (req.user.id !== client_id) {
        throw new AppError(403, "Cannot view another client's jobs");
      }
    }
    const data = await listJobs({
      category: req.query.category
        ? String(req.query.category)
        : undefined,
      skill: req.query.skill ? String(req.query.skill) : undefined,
      // Only defaulted to "open" for the public browse case — a client_id
      // filter means "my posted jobs," which should show every status.
      // See listJobs' own status-defaulting for the client_id branch.
      status: req.query.status
        ? jobStatusSchema.parse(req.query.status)
        : undefined,
      client_id,
      budget_min,
      budget_max,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    res.json(data);
  }),
);

jobsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const job = await getJob(param(req, "id"));
    res.json(job);
  }),
);

jobsRouter.post(
  "/",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().min(1),
        budget: z.number().positive(),
        category: z.string().optional(),
        skills_required: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const job = await createJob(req.user!.id, body);
    res.status(201).json(job);
  }),
);

jobsRouter.put(
  "/:id",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        budget: z.number().positive().optional(),
        category: z.string().nullable().optional(),
        skills_required: z.array(z.string()).nullable().optional(),
      })
      .parse(req.body);
    const job = await updateJob(param(req, "id"), req.user!.id, body);
    res.json(job);
  }),
);

jobsRouter.patch(
  "/:id",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const job = await cancelJob(param(req, "id"), req.user!.id);
    res.json(job);
  }),
);

jobsRouter.delete(
  "/:id",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    await deleteJob(param(req, "id"), req.user!.id);
    res.status(204).send();
  }),
);