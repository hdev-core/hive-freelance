import jwt from "jsonwebtoken";
import type { UserRole } from "@hive-freelance/db";

export const JWT_COOKIE = "hf_token";

export type JwtPayload = {
  sub: string;
  /** Hive username — matches Auth_Roles_Strategy.md */
  username: string;
  role: UserRole;
};

type LegacyJwt = JwtPayload & { hiveUsername?: string };

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: "24h" });
}

export function verifyToken(token: string): JwtPayload {
  const raw = jwt.verify(token, secret()) as LegacyJwt;
  return {
    sub: raw.sub,
    username: raw.username ?? raw.hiveUsername ?? "",
    role: raw.role,
  };
}

// Lazily computed and validated on first actual use, NOT at module load.
// index.ts imports routes (which transitively import this file) BEFORE
// it calls loadEnv() — with ES modules, all imports are fully evaluated
// before the importing file's own body runs, so a module-level read of
// process.env.COOKIE_SECURE here would always see it as unset,
// regardless of what's actually in .env. Deferring to first call means
// this runs after the server has already finished bootstrapping and is
// handling a real request, by which point loadEnv() has long since run.
// Still only computed and validated once — cached after that — same
// intent as before, just triggered correctly instead of racing dotenv.
let cachedSecureCookies: boolean | undefined;

function getSecureCookies(): boolean {
  if (cachedSecureCookies === undefined) {
    const raw = process.env.COOKIE_SECURE;
    if (raw !== undefined && raw !== "true" && raw !== "false") {
      throw new Error(
        `COOKIE_SECURE must be exactly "true" or "false" (case-sensitive) if set, got: "${raw}"`,
      );
    }
    cachedSecureCookies = raw === "true";
  }
  return cachedSecureCookies;
}

export function cookieOptions() {
  // Deliberately its own env var, not tied to NODE_ENV === "production".
  // NODE_ENV=production would also silently disable
  // ENABLE_DEV_AUTH_ROUTES (see routes/auth.ts / health.ts), which
  // dev/staging deployments still need working — see the deploy runbook
  // for the full reasoning. COOKIE_SECURE lets a hosted-but-still-dev
  // environment get correct cookie security without that side effect.
  const secureCookies = getSecureCookies();
  return {
    httpOnly: true,
    secure: secureCookies,
    // "none" requires secure: true — browsers reject/drop the cookie
    // otherwise, so these two have to move together. Needed once the
    // frontend (Vercel) and API (its own subdomain) are genuinely
    // cross-site. Locally, frontend+API are same-origin via the Vite
    // proxy and there's no HTTPS, so this correctly falls back to
    // "strict" with COOKIE_SECURE unset/false.
    sameSite: secureCookies ? ("none" as const) : ("strict" as const),
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  };
}

/**
 * Same security attributes as cookieOptions() (secure/sameSite/httpOnly/
 * path must match for the browser to correctly process the deletion
 * across the same security context the cookie was set under) but WITHOUT
 * maxAge. This isn't cosmetic: when maxAge is present, the underlying
 * cookie-serialization library computes Expires FROM it, silently
 * overriding Express's own clearCookie default of an already-past
 * Expires — the exact thing that's supposed to make the browser delete
 * the cookie immediately. Passing cookieOptions() (with its 24h maxAge)
 * straight into clearCookie() looks right but actually reissues a
 * live, merely-empty-valued cookie for another 24 hours instead of
 * deleting it.
 */
export function clearCookieOptions() {
  const { maxAge: _maxAge, ...rest } = cookieOptions();
  return rest;
}