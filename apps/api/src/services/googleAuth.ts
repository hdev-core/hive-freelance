import { createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma, type UserRole, type UserRow } from "@hive-freelance/db";
import { provisionGoogleUser } from "@hive-freelance/provisioner";
import { AppError } from "../lib/errors.js";
import {
  findUserByGoogleSub,
  linkGoogleAccount,
  upsertUser,
} from "./users.js";

export type GoogleIdentity = {
  sub: string;
  email: string;
};

function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function getGoogleAuthUrl(state?: string): string {
  if (!googleConfigured()) {
    throw new AppError(
      501,
      "Google OAuth not configured — set GOOGLE_CLIENT_ID/SECRET or use POST /auth/dev-google",
      "GOOGLE_NOT_CONFIGURED",
    );
  }
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state: state ?? "hive-freelance",
    prompt: "consent",
  });
}

export async function exchangeGoogleCode(
  code: string,
): Promise<GoogleIdentity> {
  if (!googleConfigured()) {
    throw new AppError(501, "Google OAuth not configured");
  }
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new AppError(400, "Google did not return an id_token");
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new AppError(400, "Invalid Google identity");
  }
  return { sub: payload.sub, email: payload.email };
}

/**
 * Serializes concurrent first-logins for the same Google identity with a
 * Postgres advisory lock, so two simultaneous callbacks (double-click,
 * browser retry) can't both provision a brand-new Hive account for the
 * same sub. Ported from a manual BEGIN/pg_advisory_xact_lock/COMMIT to a
 * Prisma interactive transaction — same lock, same scope-to-transaction
 * release semantics, just run via tx.$executeRaw instead of a raw pool
 * client. Throwing inside `fn` rolls back (and releases the lock) exactly
 * like the original's catch/ROLLBACK.
 */
async function withGoogleSubLock<T>(
  sub: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = BigInt(
    `0x${createHash("sha256").update(sub).digest("hex").slice(0, 15)}`,
  );
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
    return fn();
  });
}

/**
 * Lookup or provision a platform user for a Google identity.
 */
export async function loginOrProvisionGoogle(
  identity: GoogleIdentity,
  role: UserRole = "both",
): Promise<{ user: UserRow; provisioned: boolean; rcWarning: string | null }> {
  const existing = await findUserByGoogleSub(identity.sub);
  if (existing) {
    return { user: existing, provisioned: false, rcWarning: null };
  }

  return withGoogleSubLock(identity.sub, async () => {
    // Re-check inside the lock — a concurrent request may have provisioned
    // this identity while we were waiting for it.
    const existingInLock = await findUserByGoogleSub(identity.sub);
    if (existingInLock) {
      return { user: existingInLock, provisioned: false, rcWarning: null };
    }

    const provisioned = await provisionGoogleUser({ email: identity.email });
    const user = await upsertUser({
      hiveUsername: provisioned.hiveUsername,
      email: identity.email,
      role,
      authType: "google",
      kmsKeyRef: provisioned.kmsKeyRef,
    });
    await linkGoogleAccount(user.id, identity.sub);
    // NOTE: the provisioner on this branch no longer produces rcWarning
    // (its `rc` is non-nullable now, no try/catch fallback) — hardcoded to
    // null here rather than dropping the field, since routes/auth.ts still
    // destructures rcWarning and that file isn't part of this port.
    return { user, provisioned: true, rcWarning: null };
  });
}
