import jwt from "jsonwebtoken";
import type { UserRole } from "@hive-freelance/db";

export const JWT_COOKIE = "hf_token";

export type JwtPayload = {
  sub: string;
  hiveUsername: string;
  role: UserRole;
};

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: "24h" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret()) as JwtPayload;
}

export function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  };
}
