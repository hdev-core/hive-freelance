import { createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { getPool, type UserRole, type UserRow } from "@hive-freelance/db";
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
 * same sub. The lock is scoped to a hash of `sub`, held for the duration
 * of the transaction, and released automatically on commit/rollback.
 */
async function withGoogleSubLock<T>(
  sub: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  const lockKey = BigInt(
    `0x${createHash("sha256").update(sub).digest("hex").slice(0, 15)}`,
  ).toString();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockKey]);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
    return { user, provisioned: true, rcWarning: provisioned.rcWarning };
  });
}
