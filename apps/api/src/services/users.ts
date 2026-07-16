import { getPool, type UserRole, type UserRow } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { assertNotSelfContract } from "../middleware/auth.js";

export async function upsertUser(opts: {
  hiveUsername: string;
  role?: UserRole;
  authType?: "keychain" | "google" | "claimed";
  email?: string | null;
  kmsKeyRef?: string | null;
}): Promise<UserRow> {
  const pool = getPool();
  const username = opts.hiveUsername.trim().toLowerCase();
  const role = opts.role ?? "both";
  const authType = opts.authType ?? "keychain";

  const existing = await pool.query<UserRow>(
    `SELECT * FROM users WHERE hive_username = $1`,
    [username],
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await pool.query<UserRow>(
    `
    INSERT INTO users (hive_username, email, role, auth_type, kms_key_ref)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [username, opts.email ?? null, role, authType, opts.kmsKeyRef ?? null],
  );
  const user = inserted.rows[0]!;

  await pool.query(
    `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [user.id],
  );

  return user;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const result = await getPool().query<UserRow>(
    `SELECT * FROM users WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const result = await getPool().query<UserRow>(
    `SELECT * FROM users WHERE hive_username = $1`,
    [username.trim().toLowerCase()],
  );
  return result.rows[0] ?? null;
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<UserRow> {
  const result = await getPool().query<UserRow>(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING *`,
    [userId, role],
  );
  return result.rows[0]!;
}

export async function findUserByGoogleSub(
  providerUserId: string,
): Promise<UserRow | null> {
  const result = await getPool().query<UserRow>(
    `
    SELECT u.*
    FROM users u
    JOIN oauth_accounts o ON o.user_id = u.id
    WHERE o.provider = 'google' AND o.provider_user_id = $1
    `,
    [providerUserId],
  );
  return result.rows[0] ?? null;
}

export async function linkGoogleAccount(
  userId: string,
  providerUserId: string,
): Promise<void> {
  await getPool().query(
    `
    INSERT INTO oauth_accounts (user_id, provider, provider_user_id)
    VALUES ($1, 'google', $2)
    ON CONFLICT (provider_user_id) DO NOTHING
    `,
    [userId, providerUserId],
  );
}

export function ensureNotSelfDeal(
  clientId: string,
  freelancerId: string,
): void {
  assertNotSelfContract(clientId, freelancerId);
}

export async function markUserClaimed(userId: string): Promise<UserRow> {
  const result = await getPool().query<UserRow>(
    `
    UPDATE users
    SET auth_type = 'claimed', kms_key_ref = NULL
    WHERE id = $1
    RETURNING *
    `,
    [userId],
  );
  if (!result.rows[0]) throw new AppError(404, "User not found");
  return result.rows[0];
}
