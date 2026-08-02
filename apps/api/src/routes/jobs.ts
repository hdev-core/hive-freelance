import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../lib/errors.js";
import { param } from "../lib/params.js";
import { requireAuth, requireClient } from "../middleware/auth.js";
import {
  createJob,
  deleteJob,
  getJob,
  listJobs,
  updateJob,
} from "../services/jobs.js";

export const jobsRouter = Router();

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
    const data = await listJobs({
      category: req.query.category
        ? String(req.query.category)
        : undefined,
      skill: req.query.skill ? String(req.query.skill) : undefined,
      status: req.query.status ? String(req.query.status) : "open",
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

jobsRouter.delete(
  "/:id",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    await deleteJob(param(req, "id"), req.user!.id);
    res.status(204).send();
  }),
);