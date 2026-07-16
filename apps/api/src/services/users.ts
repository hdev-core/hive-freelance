import { getPool, type UserRole, type UserRow } from "@hive-freelance/db";

export async function upsertUser(opts: {
  hiveUsername: string;
  role?: UserRole;
  authType?: "keychain" | "google" | "claimed";
  email?: string | null;
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
    INSERT INTO users (hive_username, email, role, auth_type)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [username, opts.email ?? null, role, authType],
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
