import { OAuth2Client } from "google-auth-library";
import type { UserRole, UserRow } from "@hive-freelance/db";
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
 * Lookup or provision a platform user for a Google identity.
 */
export async function loginOrProvisionGoogle(
  identity: GoogleIdentity,
  role: UserRole = "both",
): Promise<{ user: UserRow; provisioned: boolean }> {
  const existing = await findUserByGoogleSub(identity.sub);
  if (existing) {
    return { user: existing, provisioned: false };
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
  return { user, provisioned: true };
}
