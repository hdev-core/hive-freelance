import { PrismaClient, Prisma } from "@prisma/client";

// === BigInt/JSON fix — applies globally, once, at import time ===
// All primary keys are BigInt (matches BIGSERIAL columns already live on
// Supabase). Prisma returns native bigint; JSON.stringify (and therefore
// every res.json() call) throws on bigint with no fix. This patch makes
// bigint values serialize as strings, matching what the old pg driver
// returned and what every route/frontend already expects.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

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

// === Prisma client ===
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export { Prisma };

export async function assertDbConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function closePrisma(): Promise<void> {
  await prisma.$disconnect();
}

/** True if `err` is a Prisma unique-constraint violation (was pg code 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/** True if `err` is a Prisma "record to update/delete not found" (was a missing row). */
export function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025"
  );
}

// === hive_records / listener_state helpers — ported from raw pg to Prisma ===

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
  await prisma.hiveRecord.upsert({
    where: { hiveTxId: record.hive_tx_id },
    create: {
      hiveTxId: record.hive_tx_id,
      appId: record.app_id,
      operationType: record.operation_type,
      fromAccount: record.from_account ?? null,
      toAccount: record.to_account ?? null,
      escrowId: record.escrow_id ?? null,
      payload: record.payload as Prisma.InputJsonValue | undefined,
      blockNumber:
        record.block_number != null ? BigInt(record.block_number) : null,
      blockTimestamp: record.block_timestamp
        ? new Date(record.block_timestamp)
        : null,
      confirmed: record.confirmed ?? false,
    },
    update: {
      confirmed: record.confirmed ?? false,
      // COALESCE(EXCLUDED.payload, hive_records.payload) equivalent:
      // only overwrite payload if a new one was actually provided —
      // null and undefined both mean "don't touch it", matching COALESCE.
      ...(record.payload != null
        ? { payload: record.payload as Prisma.InputJsonValue }
        : {}),
    },
  });
}

export async function markHiveRecordsConfirmed(
  upToBlock: number,
): Promise<number> {
  const result = await prisma.hiveRecord.updateMany({
    where: {
      confirmed: false,
      blockNumber: { not: null, lte: BigInt(upToBlock) },
    },
    data: { confirmed: true },
  });
  return result.count;
}

export async function getListenerCursor(): Promise<number> {
  const row = await prisma.listenerState.findUnique({
    where: { id: "default" },
  });
  return Number(row?.lastProcessedBlock ?? 0);
}

export async function setListenerCursor(block: number): Promise<void> {
  await prisma.listenerState.update({
    where: { id: "default" },
    data: { lastProcessedBlock: BigInt(block) },
  });
}

// === Prisma model -> legacy snake_case Row mappers ===
// Every service converts through these instead of returning Prisma's
// camelCase models directly, so routes/frontend see the exact same shape
// as before the port. Add one of these per table as each service gets
// ported — don't invent ad-hoc mapping per-file.

import type {
  User as PrismaUser,
  Profile as PrismaProfile,
} from "@prisma/client";
import type { ProfileRow, UserRow } from "./types.js";

export function toUserRow(u: PrismaUser): UserRow {
  return {
    id: u.id.toString(),
    hive_username: u.hiveUsername,
    email: u.email,
    role: u.role as UserRow["role"],
    auth_type: u.authType as UserRow["auth_type"],
    kms_key_ref: u.kmsKeyRef,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

export function toProfileRow(p: PrismaProfile): ProfileRow {
  return {
    id: p.id.toString(),
    user_id: p.userId.toString(),
    bio: p.bio,
    avatar_url: p.avatarUrl,
    location: p.location,
    hourly_rate: p.hourlyRate?.toString() ?? null,
    skills: p.skills,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}