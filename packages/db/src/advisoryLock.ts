import pg from "pg";

/**
 * Session-level Postgres advisory lock on a dedicated connection.
 *
 * Why not prisma.$transaction + pg_advisory_xact_lock: that ties the lock's
 * lifetime to Prisma's interactive-transaction timeout (5s default). Fine
 * for fast writes, wrong for a critical section that does real work (e.g.
 * an on-chain provisioning call) that can legitimately run longer — if the
 * tx times out mid-work, Prisma releases the lock while the protected work
 * is still running, defeating the lock's entire purpose.
 *
 * Why a dedicated connection via DIRECT_URL, not the pooled DATABASE_URL:
 * pg_advisory_lock/unlock must run on the same physical backend connection.
 * Supabase's pooled connection uses pgbouncer in transaction mode, which
 * can hand your "connection" to a different backend between statements —
 * silently breaking that same-connection requirement. DIRECT_URL (session
 * mode) guarantees one real connection for the lock's full lifetime.
 *
 * The lock is released and the connection closed in `finally`, so both
 * happen even if `fn` throws.
 */
export async function withAdvisoryLock<T>(
  lockKey: bigint,
  fn: () => Promise<T>,
): Promise<T> {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error(
      "DIRECT_URL is not set — required for session-level advisory locks",
    );
  }

  const client = new pg.Client({ connectionString: directUrl });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [
      lockKey.toString(),
    ]);
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [
        lockKey.toString(),
      ]);
    } finally {
      await client.end();
    }
  }
}