import { getPool, type ProfileRow } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { getUserByUsername } from "./users.js";

export async function getPublicProfile(username: string) {
  const user = await getUserByUsername(username);
  if (!user) throw new AppError(404, "User not found");

  const profile = await getPool().query<ProfileRow>(
    `SELECT * FROM profiles WHERE user_id = $1`,
    [user.id],
  );

  return {
    id: user.id,
    hiveUsername: user.hive_username,
    role: user.role,
    authType: user.auth_type,
    profile: profile.rows[0] ?? null,
  };
}

export async function updateProfile(
  userId: string,
  data: {
    bio?: string | null;
    avatar_url?: string | null;
    location?: string | null;
    hourly_rate?: number | null;
    skills?: string[] | null;
  },
): Promise<ProfileRow> {
  const result = await getPool().query<ProfileRow>(
    `
    INSERT INTO profiles (user_id, bio, avatar_url, location, hourly_rate, skills)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id) DO UPDATE SET
      bio = COALESCE(EXCLUDED.bio, profiles.bio),
      avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
      location = COALESCE(EXCLUDED.location, profiles.location),
      hourly_rate = COALESCE(EXCLUDED.hourly_rate, profiles.hourly_rate),
      skills = COALESCE(EXCLUDED.skills, profiles.skills)
    RETURNING *
    `,
    [
      userId,
      data.bio ?? null,
      data.avatar_url ?? null,
      data.location ?? null,
      data.hourly_rate ?? null,
      data.skills ?? null,
    ],
  );
  return result.rows[0]!;
}

export async function getDashboard(userId: string) {
  const pool = getPool();
  const [contracts, proposals, payments] = await Promise.all([
    pool.query(
      `
      SELECT * FROM contracts
      WHERE (client_id = $1 OR freelancer_id = $1) AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 50
      `,
      [userId],
    ),
    pool.query(
      `
      SELECT p.*, j.title AS job_title
      FROM proposals p
      JOIN jobs j ON j.id = p.job_id
      WHERE p.freelancer_id = $1 AND p.status = 'pending'
      ORDER BY p.created_at DESC
      LIMIT 50
      `,
      [userId],
    ),
    pool.query(
      `
      SELECT pay.*
      FROM payments pay
      JOIN contracts c ON c.id = pay.contract_id
      WHERE c.client_id = $1 OR c.freelancer_id = $1
      ORDER BY pay.updated_at DESC
      LIMIT 20
      `,
      [userId],
    ),
  ]);

  return {
    activeContracts: contracts.rows,
    pendingProposals: proposals.rows,
    recentPayments: payments.rows,
  };
}
