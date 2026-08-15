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

export function cookieOptions() {
  // Deliberately its own env var, not tied to NODE_ENV === "production".
  // NODE_ENV=production would also silently disable
  // ENABLE_DEV_AUTH_ROUTES (see routes/auth.ts / health.ts), which
  // dev/staging deployments still need working — see the deploy runbook
  // for the full reasoning. COOKIE_SECURE lets a hosted-but-still-dev
  // environment get correct cookie security without that side effect.
  const secureCookies = process.env.COOKIE_SECURE === "true";
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