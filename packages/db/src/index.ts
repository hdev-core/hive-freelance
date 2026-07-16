import { getPool } from "./pool.js";

export { closePool, getPool, pingDb } from "./pool.js";
export type { Pool, PoolClient } from "./pool.js";

export type {
  AuthType,
  ContractRow,
  ContractStatus,
  DisputeRow,
  DisputeStatus,
  HiveRecordRow,
  JobRow,
  JobStatus,
  ListenerStateRow,
  MilestoneRow,
  MilestoneStatus,
  OAuthAccountRow,
  OAuthProvider,
  PaymentCurrency,
  PaymentRow,
  PaymentStatus,
  ProfileRow,
  ProposalRow,
  ProposalStatus,
  ResolutionDirection,
  ReviewRow,
  UserRole,
  UserRow,
} from "./types.js";

export type HiveRecordInsert = {
  hive_tx_id: string;
  app_id: string;
  operation_type: string;
  from_account?: string | null;
  to_account?: string | null;
  escrow_id?: number | null;
  payload?: unknown;
  block_number?: number | null;
  block_timestamp?: Date | string | null;
  confirmed?: boolean;
};

export async function upsertHiveRecord(
  record: HiveRecordInsert,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO hive_records (
      hive_tx_id, app_id, operation_type, from_account, to_account,
      escrow_id, payload, block_number, block_timestamp, confirmed
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (hive_tx_id) DO UPDATE SET
      confirmed = EXCLUDED.confirmed,
      payload = COALESCE(EXCLUDED.payload, hive_records.payload),
      updated_at = now()
    `,
    [
      record.hive_tx_id,
      record.app_id,
      record.operation_type,
      record.from_account ?? null,
      record.to_account ?? null,
      record.escrow_id ?? null,
      record.payload ? JSON.stringify(record.payload) : null,
      record.block_number ?? null,
      record.block_timestamp ?? null,
      record.confirmed ?? false,
    ],
  );
}

export async function markHiveRecordsConfirmed(
  upToBlock: number,
): Promise<number> {
  const result = await getPool().query(
    `
    UPDATE hive_records
    SET confirmed = true, updated_at = now()
    WHERE confirmed = false
      AND block_number IS NOT NULL
      AND block_number <= $1
    `,
    [upToBlock],
  );
  return result.rowCount ?? 0;
}

export async function getListenerCursor(): Promise<number> {
  const result = await getPool().query<{ last_processed_block: string }>(
    `SELECT last_processed_block FROM listener_state WHERE id = 'default'`,
  );
  return Number(result.rows[0]?.last_processed_block ?? 0);
}

export async function setListenerCursor(block: number): Promise<void> {
  await getPool().query(
    `
    UPDATE listener_state
    SET last_processed_block = $1, updated_at = now()
    WHERE id = 'default'
    `,
    [block],
  );
}
