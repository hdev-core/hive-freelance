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
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    // Strict matches Auth doc; same-origin Vite proxy keeps cookies working locally.
    sameSite: "strict" as const,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  };
}
