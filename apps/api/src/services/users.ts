import {
  prisma,
  isUniqueViolation,
  isNotFoundError,
  toUserRow,
  type UserRole,
  type UserRow,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { assertNotSelfContract } from "../middleware/auth.js";

export async function upsertUser(opts: {
  hiveUsername: string;
  role?: UserRole;
  authType?: "keychain" | "google" | "claimed";
  email?: string | null;
  kmsKeyRef?: string | null;
}): Promise<UserRow> {
  const username = opts.hiveUsername.trim().toLowerCase();
  const role = opts.role ?? "both";
  const authType = opts.authType ?? "keychain";

  const existing = await prisma.user.findUnique({
    where: { hiveUsername: username },
  });
  if (existing) {
    return toUserRow(existing);
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        hiveUsername: username,
        email: opts.email ?? null,
        role,
        authType,
        kmsKeyRef: opts.kmsKeyRef ?? null,
      },
    });
  } catch (err) {
    // Concurrent insert for the same username/email (e.g. two simultaneous
    // Google first-logins) — fall back to whichever row won the race instead
    // of surfacing a raw constraint error. Same intent as the old pg 23505
    // handling, just against Prisma's P2002.
    if (isUniqueViolation(err)) {
      const byUsername = await prisma.user.findUnique({
        where: { hiveUsername: username },
      });
      if (byUsername) return toUserRow(byUsername);
      if (opts.email) {
        const byEmail = await prisma.user.findUnique({
          where: { email: opts.email },
        });
        if (byEmail) return toUserRow(byEmail);
      }
    }
    throw err;
  }

  // ON CONFLICT (user_id) DO NOTHING equivalent
  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  return toUserRow(user);
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const user = await prisma.user.findUnique({ where: { id: BigInt(id) } });
  return user ? toUserRow(user) : null;
}

export async function getUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const user = await prisma.user.findUnique({
    where: { hiveUsername: username.trim().toLowerCase() },
  });
  return user ? toUserRow(user) : null;
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<UserRow> {
  const user = await prisma.user.update({
    where: { id: BigInt(userId) },
    data: { role },
  });
  return toUserRow(user);
}

export async function findUserByGoogleSub(
  providerUserId: string,
): Promise<UserRow | null> {
  const account = await prisma.oauthAccount.findFirst({
    where: { provider: "google", providerUserId },
    include: { user: true },
  });
  return account ? toUserRow(account.user) : null;
}

export async function linkGoogleAccount(
  userId: string,
  providerUserId: string,
): Promise<void> {
  // ON CONFLICT (provider_user_id) DO NOTHING equivalent
  await prisma.oauthAccount.upsert({
    where: { providerUserId },
    update: {},
    create: {
      userId: BigInt(userId),
      provider: "google",
      providerUserId,
    },
  });
}

export function ensureNotSelfDeal(
  clientId: string,
  freelancerId: string,
): void {
  assertNotSelfContract(clientId, freelancerId);
}

export async function markUserClaimed(userId: string): Promise<UserRow> {
  try {
    const user = await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { authType: "claimed", kmsKeyRef: null },
    });
    return toUserRow(user);
  } catch (err) {
    if (isNotFoundError(err)) {
      throw new AppError(404, "User not found");
    }
    throw err;
  }
}