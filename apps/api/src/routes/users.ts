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

usersRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await getPublicProfile(req.user!.username);
    res.json(profile);
  }),
);

// http/https only — a bare z.string().url() also accepts javascript:/data:
// URLs, which get rendered as an href on the profile page. Restricting the
// protocol closes that XSS vector.
const httpUrl = z
  .string()
  .url()
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

usersRouter.put(
  "/me/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        display_name: z.string().min(1).max(100).nullable().optional(),
        bio: z.string().max(1000).nullable().optional(),
        // Same http/https-only rule as portfolio links — avatar_url also
        // ends up as a rendered img src, same XSS vector.
        avatar_url: httpUrl.nullable().optional(),
        location: z.string().nullable().optional(),
        hourly_rate: z.number().positive().nullable().optional(),
        skills: z.array(z.string().min(1).max(50)).max(20).nullable().optional(),
        // Matches the DB's portfolio_links_shape CHECK constraint (max 10).
        portfolio_links: z
          .array(portfolioLinkSchema)
          .max(10)
          .nullable()
          .optional(),
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
