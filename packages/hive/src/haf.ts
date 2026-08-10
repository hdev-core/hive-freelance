import pg from "pg";
import type {
  HafAccount,
  HafOperation,
  HafPingResult,
  HiveReadStore,
} from "./hiveReadStore.js";

const { Pool } = pg;

export type HafReadStoreOptions = {
  connectionString?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __hafPools: Map<string, pg.Pool> | undefined;
}

function normalizeAccountName(name: string): string {
  return name.trim().replace(/^@+/, "").toLowerCase();
}

function requireHafUrl(explicit?: string): string {
  const url = explicit ?? process.env.HAF_DATABASE_URL;
  if (!url?.trim()) {
    throw new Error(
      "HAF_DATABASE_URL is not set — configure local hive_haf or shared HAF Postgres",
    );
  }
  return url;
}

function poolMax(): number {
  const raw = Number(process.env.HAF_POOL_MAX);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

function getPoolMap(): Map<string, pg.Pool> {
  if (!global.__hafPools) {
    global.__hafPools = new Map();
  }
  return global.__hafPools;
}

function getSharedPool(connectionString: string): pg.Pool {
  const pools = getPoolMap();
  const existing = pools.get(connectionString);
  if (existing) return existing;

  const pool = new Pool({ connectionString, max: poolMax() });
  // Idle client failures (Postgres restart, network blip) emit 'error' on the
  // pool. With no listener, EventEmitter throws and kills the process — fatal
  // once the pool is a process-scoped singleton.
  pool.on("error", (err) =>
    console.error("[haf] idle client error", err.message),
  );
  // Always stash on globalThis so tsx/watch reloads reuse one pool (matches
  // packages/db Prisma pattern in non-production; fine in production too).
  pools.set(connectionString, pool);
  return pool;
}

function mapAccount(row: {
  id: string | number;
  name: string;
  created_at: Date | string;
  json_metadata: unknown;
}): HafAccount {
  return {
    id: Number(row.id),
    name: row.name,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    jsonMetadata: row.json_metadata ?? {},
  };
}

function mapOp(row: {
  id: string | number;
  block_num: number;
  trx_in_block: number;
  op_pos: number;
  op_type: string;
  body: unknown;
  timestamp: Date | string;
}): HafOperation {
  return {
    id: Number(row.id),
    blockNum: row.block_num,
    trxInBlock: row.trx_in_block,
    opPos: row.op_pos,
    opType: row.op_type,
    body: row.body ?? {},
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : String(row.timestamp),
  };
}

/**
 * SQL reader against a HAF-compatible Postgres projection (`hafd` schema).
 * Uses a process-scoped `pg.Pool` keyed by connection string — call
 * `closeHafPool()` on API shutdown.
 * `HiveReadStore.close()` is a no-op so per-request teardown cannot kill the pool.
 */
export function createHafReadStore(
  opts: HafReadStoreOptions = {},
): HiveReadStore {
  const connectionString = requireHafUrl(opts.connectionString);
  const pool = getSharedPool(connectionString);

  return {
    async getAccount(name: string): Promise<HafAccount | null> {
      const normalized = normalizeAccountName(name);
      if (!normalized) return null;

      const result = await pool.query<{
        id: string | number;
        name: string;
        created_at: Date | string;
        json_metadata: unknown;
      }>(
        `SELECT id, name, created_at, json_metadata
         FROM hafd.accounts
         WHERE name = $1
         LIMIT 1`,
        [normalized],
      );
      const row = result.rows[0];
      return row ? mapAccount(row) : null;
    },

    async getRecentAccountOps(
      name: string,
      limit = 20,
    ): Promise<HafOperation[]> {
      const normalized = normalizeAccountName(name);
      if (!normalized) return [];

      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
      const result = await pool.query<{
        id: string | number;
        block_num: number;
        trx_in_block: number;
        op_pos: number;
        op_type: string;
        body: unknown;
        timestamp: Date | string;
      }>(
        `SELECT o.id, o.block_num, o.trx_in_block, o.op_pos, o.op_type, o.body, o."timestamp"
         FROM hafd.accounts a
         JOIN hafd.account_operations ao ON ao.account_id = a.id
         JOIN hafd.operations o ON o.id = ao.operation_id
         WHERE a.name = $1
         ORDER BY o.block_num DESC, o.id DESC
         LIMIT $2`,
        [normalized, safeLimit],
      );
      return result.rows.map(mapOp);
    },

    async ping(): Promise<HafPingResult> {
      const result = await pool.query<{
        account_count: string | number;
        operation_count: string | number;
      }>(
        `SELECT
           (SELECT COUNT(*)::int FROM hafd.accounts) AS account_count,
           (SELECT COUNT(*)::int FROM hafd.operations) AS operation_count`,
      );
      const row = result.rows[0];
      return {
        ok: true,
        accountCount: Number(row?.account_count ?? 0),
        operationCount: Number(row?.operation_count ?? 0),
      };
    },

    async close(): Promise<void> {
      // Shared process pool — use closeHafPool() on shutdown instead.
    },
  };
}

/**
 * Ends all shared HAF pools (process shutdown). Safe if never opened.
 * Clears the global map before awaiting `end()` so concurrent callers cannot
 * reuse a pool that is shutting down.
 */
export async function closeHafPool(): Promise<void> {
  const pools = global.__hafPools;
  if (!pools || pools.size === 0) return;
  const toClose = [...pools.values()];
  global.__hafPools = undefined;
  await Promise.all(toClose.map((pool) => pool.end()));
}

/** True when HAF_DATABASE_URL is present (does not open a connection). */
export function isHafConfigured(): boolean {
  return Boolean(process.env.HAF_DATABASE_URL?.trim());
}
