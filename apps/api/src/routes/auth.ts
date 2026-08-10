import { Router } from "express";
import { z } from "zod";
import type { UserRole } from "@hive-freelance/db";
import { AppError, asyncHandler } from "../lib/errors.js";
import { createChallenge, consumeChallenge } from "../lib/challengeStore.js";
import {
  devSeedUsername,
  devSignerConfigured,
  signChallengeWithSeedAccount,
} from "../lib/devSeedSigner.js";
import {
  getAccountRcStatus,
  getHiveAccount,
  isValidHiveUsername,
  normalizeHiveUsername,
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

/**
 * Dev-only routes require both a non-production NODE_ENV *and* an explicit
 * opt-in flag, so they can't accidentally be reachable in a misconfigured
 * staging/preview environment where NODE_ENV isn't exactly "production".
 */
function devAuthRoutesEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_AUTH_ROUTES === "true"
  );
}

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
    const username = normalizeHiveUsername(String(req.query.username ?? ""));
    if (!username) {
      throw new AppError(400, "username query param required");
    }
    if (!isValidHiveUsername(username)) {
      throw new AppError(
        400,
        "Enter a valid Hive username (3–16 lowercase letters/numbers per part; hyphens ok; no @ or underscores)",
        "INVALID_USERNAME",
      );
    }
    const account = await getHiveAccount(username);
    if (!account) {
      throw new AppError(404, `Hive account @${username} not found`);
    }
    const { challenge, expires_in } = createChallenge(username);
    res.json({ challenge, expires_in, username });
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
    const username = normalizeHiveUsername(body.username);

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

/**
 * Dev/local login using a real, seeded throwaway Hive account (mainnet —
 * there's no usable public Hive testnet).
 * Signs the challenge with a genuine posting key (see Auth_Guide.md) and
 * runs it through the exact same verify path as a real Keychain login —
 * replaces the old dev-login bypass, which skipped verification entirely.
 */
authRouter.post(
  "/dev-keychain-login",
  asyncHandler(async (req, res) => {
    if (!devAuthRoutesEnabled()) {
      throw new AppError(404, "Not found");
    }
    if (!devSignerConfigured()) {
      throw new AppError(
        501,
        "DEV_SEED_HIVE_USERNAME / DEV_SEED_POSTING_KEY not set — see Auth_Guide.md",
        "DEV_SIGNER_NOT_CONFIGURED",
      );
    }
    const body = z
      .object({ role: z.enum(["client", "freelancer", "both"]).optional() })
      .parse(req.body);

    const username = devSeedUsername();
    const { challenge } = createChallenge(username);
    const signature = signChallengeWithSeedAccount(challenge);

    if (!consumeChallenge(username, challenge)) {
      throw new AppError(500, "Failed to consume freshly issued dev challenge");
    }
    const ok = await verifyPostingSignature(username, challenge, signature);
    if (!ok) {
      throw new AppError(500, "Dev seed signature failed real verification");
    }

    const user = await upsertUser({
      hiveUsername: username,
      role: body.role ?? "both",
      authType: "keychain",
    });

    console.warn(`[auth] dev-keychain-login used for @${username}`);
    res.json({
      ...issueSession(res, user),
      warning: "dev-keychain-login only — not for production",
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

function webOrigin(): string {
  return process.env.WEB_ORIGIN ?? "http://localhost:5173";
}

/**
 * Google OAuth failures must never throw a raw JSON error here — the
 * browser is mid full-page-navigation on the API's own origin at this
 * point, not talking to the SPA over fetch, so a thrown AppError would
 * strand the user on a bare JSON response instead of back on /login.
 * Every failure path redirects back to the web app with a `google_error`
 * code the SPA can show a friendly message for instead.
 */
authRouter.get(
  "/google",
  asyncHandler(async (_req, res) => {
    try {
      const url = getGoogleAuthUrl();
      res.redirect(url);
    } catch (err) {
      console.error("[auth] Failed to start Google OAuth:", err);
      res.redirect(`${webOrigin()}/login?google_error=not_configured`);
    }
  }),
);

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const oauthError = req.query.error ? String(req.query.error) : null;
    const code = req.query.code ? String(req.query.code) : "";

    if (oauthError || !code) {
      res.redirect(
        `${webOrigin()}/login?google_error=${encodeURIComponent(oauthError ?? "missing_code")}`,
      );
      return;
    }

    try {
      const identity = await exchangeGoogleCode(code);
      const { user, provisioned, rcWarning } = await loginOrProvisionGoogle(identity);
      if (rcWarning) console.warn(`[auth] ${rcWarning}`);
      issueSession(res, user);
      // Cookie already set on API domain — when using Vite proxy, API and
      // web share localhost so cookie works.
      res.redirect(
        `${webOrigin()}/login?google=1&provisioned=${provisioned ? "1" : "0"}`,
      );
    } catch (err) {
      console.error("[auth] Google callback failed:", err);
      res.redirect(`${webOrigin()}/login?google_error=callback_failed`);
    }
  }),
);

/** Non-production Google identity simulator. */
authRouter.post(
  "/dev-google",
  asyncHandler(async (req, res) => {
    if (!devAuthRoutesEnabled()) {
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
    console.warn(`[auth] dev-google used for ${body.email}`);
    const { user, provisioned, rcWarning } = await loginOrProvisionGoogle(
      identity,
      body.role ?? "both",
    );
    res.json({
      ...issueSession(res, user),
      provisioned,
      rc_warning: rcWarning ?? null,
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
