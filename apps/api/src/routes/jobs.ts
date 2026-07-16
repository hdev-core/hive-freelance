import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors.js";
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

jobsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await listJobs({
      category: req.query.category
        ? String(req.query.category)
        : undefined,
      skill: req.query.skill ? String(req.query.skill) : undefined,
      status: req.query.status ? String(req.query.status) : "open",
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
