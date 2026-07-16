import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors.js";
import { param } from "../lib/params.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getDashboard,
  getPublicProfile,
  updateProfile,
} from "../services/profiles.js";

export const usersRouter = Router();

usersRouter.get(
  "/:username/reviews",
  asyncHandler(async (_req, res) => {
    res.status(501).json({ error: "Reviews not implemented in MVP slice" });
  }),
);

usersRouter.get(
  "/me/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await getDashboard(req.user!.id);
    res.json(data);
  }),
);

usersRouter.put(
  "/me/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        bio: z.string().nullable().optional(),
        avatar_url: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        hourly_rate: z.number().positive().nullable().optional(),
        skills: z.array(z.string()).nullable().optional(),
      })
      .parse(req.body);
    const profile = await updateProfile(req.user!.id, body);
    res.json({ profile });
  }),
);

usersRouter.get(
  "/:username",
  asyncHandler(async (req, res) => {
    const profile = await getPublicProfile(param(req, "username"));
    res.json(profile);
  }),
);
