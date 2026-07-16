import { Router } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../lib/errors.js";
import { createChallenge, consumeChallenge } from "../lib/challengeStore.js";
import { getHiveAccount, verifyPostingSignature } from "../lib/hiveAuth.js";
import {
  cookieOptions,
  JWT_COOKIE,
  signToken,
} from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { upsertUser, updateUserRole } from "../services/users.js";
import type { UserRole } from "@hive-freelance/db";

export const authRouter = Router();

authRouter.get(
  "/challenge",
  asyncHandler(async (req, res) => {
    const username = String(req.query.username ?? "").trim();
    if (!username) {
      throw new AppError(400, "username query param required");
    }
    const account = await getHiveAccount(username);
    if (!account) {
      throw new AppError(404, `Hive account @${username} not found`);
    }
    const { challenge, expires_in } = createChallenge(username);
    res.json({ challenge, expires_in, username: username.toLowerCase() });
  }),
);

const verifyBody = z.object({
  username: z.string().min(1),
  signature: z.string().min(1),
  challenge: z.string().min(1),
  role: z.enum(["client", "freelancer", "both"]).optional(),
});

authRouter.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const body = verifyBody.parse(req.body);
    const username = body.username.trim().toLowerCase();

    if (!consumeChallenge(username, body.challenge)) {
      throw new AppError(401, "Invalid or expired challenge", "BAD_CHALLENGE");
    }

    const ok = await verifyPostingSignature(
      username,
      body.challenge,
      body.signature,
    );
    if (!ok) {
      throw new AppError(401, "Invalid signature", "BAD_SIGNATURE");
    }

    let user = await upsertUser({
      hiveUsername: username,
      role: body.role ?? "both",
      authType: "keychain",
    });
    if (body.role && body.role !== user.role) {
      user = await updateUserRole(user.id, body.role as UserRole);
    }

    const token = signToken({
      sub: user.id,
      hiveUsername: user.hive_username,
      role: user.role,
    });
    res.cookie(JWT_COOKIE, token, cookieOptions());
    res.json({
      ok: true,
      user: {
        id: user.id,
        hiveUsername: user.hive_username,
        role: user.role,
        authType: user.auth_type,
      },
    });
  }),
);

/** Dev-only login without Keychain — disabled in production. */
authRouter.post(
  "/dev-login",
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(404, "Not found");
    }
    const body = z
      .object({
        username: z.string().min(1),
        role: z.enum(["client", "freelancer", "both"]).optional(),
      })
      .parse(req.body);

    const user = await upsertUser({
      hiveUsername: body.username,
      role: body.role ?? "both",
      authType: "keychain",
    });

    const token = signToken({
      sub: user.id,
      hiveUsername: user.hive_username,
      role: user.role,
    });
    res.cookie(JWT_COOKIE, token, cookieOptions());
    res.json({
      ok: true,
      user: {
        id: user.id,
        hiveUsername: user.hive_username,
        role: user.role,
        authType: user.auth_type,
      },
      warning: "dev-login only — not for production",
    });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    res.clearCookie(JWT_COOKIE, { path: "/" });
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

// Phase 2 / later stubs
authRouter.get("/google", (_req, res) => {
  res.status(501).json({ error: "Google OAuth not implemented in MVP slice" });
});
authRouter.get("/google/callback", (_req, res) => {
  res.status(501).json({ error: "Google OAuth not implemented in MVP slice" });
});
authRouter.post("/me/claim-account", requireAuth, (_req, res) => {
  res.status(501).json({ error: "Claim-account not implemented in MVP slice" });
});
