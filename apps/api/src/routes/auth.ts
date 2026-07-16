import { Router } from "express";
import { z } from "zod";
import type { UserRole } from "@hive-freelance/db";
import { AppError, asyncHandler } from "../lib/errors.js";
import { createChallenge, consumeChallenge } from "../lib/challengeStore.js";
import {
  getAccountRcStatus,
  getHiveAccount,
  verifyPostingSignature,
} from "../lib/hiveAuth.js";
import {
  cookieOptions,
  JWT_COOKIE,
  signToken,
} from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { claimAccount } from "../services/claimAccount.js";
import {
  exchangeGoogleCode,
  getGoogleAuthUrl,
  loginOrProvisionGoogle,
} from "../services/googleAuth.js";
import {
  getUserById,
  updateUserRole,
  upsertUser,
} from "../services/users.js";

export const authRouter = Router();

function issueSession(
  res: import("express").Response,
  user: {
    id: string;
    hive_username: string;
    role: UserRole;
    auth_type: string;
  },
) {
  const token = signToken({
    sub: user.id,
    username: user.hive_username,
    role: user.role,
  });
  res.cookie(JWT_COOKIE, token, cookieOptions());
  return {
    ok: true as const,
    user: {
      id: user.id,
      username: user.hive_username,
      role: user.role,
      authType: user.auth_type,
    },
  };
}

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
      user = await updateUserRole(user.id, body.role);
    }

    const rc = await getAccountRcStatus(username);
    res.json({
      ...issueSession(res, user),
      rc_warning: rc?.warning ?? null,
      rc: rc
        ? { pct: rc.pct, low: rc.low, max_mana: rc.max_mana }
        : null,
    });
  }),
);

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

    res.json({
      ...issueSession(res, user),
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
    const dbUser = await getUserById(req.user!.id);
    res.json({
      user: {
        id: req.user!.id,
        username: req.user!.username,
        role: req.user!.role,
        authType: dbUser?.auth_type ?? null,
        email: dbUser?.email ?? null,
        custodial: dbUser?.auth_type === "google",
      },
    });
  }),
);

authRouter.put(
  "/me/role",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ role: z.enum(["client", "freelancer", "both"]) })
      .parse(req.body);
    const user = await updateUserRole(req.user!.id, body.role);
    res.json(issueSession(res, user));
  }),
);

// --- Google OAuth ---

authRouter.get(
  "/google",
  asyncHandler(async (_req, res) => {
    const url = getGoogleAuthUrl();
    res.redirect(url);
  }),
);

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const code = String(req.query.code ?? "");
    if (!code) throw new AppError(400, "Missing code");
    const identity = await exchangeGoogleCode(code);
    const { user, provisioned } = await loginOrProvisionGoogle(identity);
    const session = issueSession(res, user);
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    // Redirect back to web with a simple query flag (cookie already set on API domain —
    // when using Vite proxy, API and web share localhost so cookie works).
    res.redirect(
      `${webOrigin}/login?google=1&provisioned=${provisioned ? "1" : "0"}`,
    );
    void session;
  }),
);

/** Non-production Google identity simulator. */
authRouter.post(
  "/dev-google",
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(404, "Not found");
    }
    const body = z
      .object({
        email: z.string().email(),
        sub: z.string().optional(),
        role: z.enum(["client", "freelancer", "both"]).optional(),
      })
      .parse(req.body);

    const identity = {
      email: body.email,
      sub: body.sub ?? `dev-google:${body.email}`,
    };
    const { user, provisioned } = await loginOrProvisionGoogle(
      identity,
      body.role ?? "both",
    );
    res.json({
      ...issueSession(res, user),
      provisioned,
      warning: "dev-google only — not for production",
    });
  }),
);

authRouter.post(
  "/me/claim-account",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        owner_key: z.string().min(10),
        active_key: z.string().min(10),
        posting_key: z.string().min(10),
        memo_key: z.string().min(10),
      })
      .parse(req.body);

    const result = await claimAccount(req.user!.id, body);
    const user = await getUserById(req.user!.id);
    res.json({
      ...result,
      user: user
        ? {
            id: user.id,
            username: user.hive_username,
            role: user.role,
            authType: user.auth_type,
          }
        : null,
    });
  }),
);
