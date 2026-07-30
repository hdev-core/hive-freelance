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

export { withAdvisoryLock } from "./advisoryLock.js";

// pool.ts (raw pg) removed — everything is on Prisma now.

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
  PortfolioLink,
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
  // upsert rather than update: the original raw-SQL UPDATE would silently
  // no-op (0 rows, no error) if the 'default' row were ever missing — this
  // is strictly safer, not just a workaround for the missing seed row.
  await prisma.listenerState.upsert({
    where: { id: "default" },
    update: { lastProcessedBlock: BigInt(block) },
    create: { id: "default", lastProcessedBlock: BigInt(block) },
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
import type { PortfolioLink, ProfileRow, UserRow } from "./types.js";

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
    display_name: p.displayName,
    bio: p.bio,
    avatar_url: p.avatarUrl,
    location: p.location,
    hourly_rate: p.hourlyRate?.toString() ?? null,
    skills: p.skills,
    // Defensive only: the DB CHECK constraint guarantees array shape + max
    // length, but not per-element {title, url} shape (that's enforced by
    // Zod at the route layer on write). This just stops a read from
    // crashing on legacy/malformed data instead of validating it.
    portfolio_links: Array.isArray(p.portfolioLinks)
      ? (p.portfolioLinks as PortfolioLink[])
      : null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

import type {
  Job as PrismaJob,
  Proposal as PrismaProposal,
  Contract as PrismaContract,
  Payment as PrismaPayment,
} from "@prisma/client";
import type {
  JobRow,
  ProposalRow,
  ContractRow,
  PaymentRow,
} from "./types.js";

export function toJobRow(j: PrismaJob): JobRow {
  return {
    id: j.id.toString(),
    client_id: j.clientId.toString(),
    title: j.title,
    description: j.description,
    budget: j.budget.toString(),
    category: j.category,
    skills_required: j.skillsRequired,
    status: j.status as JobRow["status"],
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  };
}

export function toProposalRow(p: PrismaProposal): ProposalRow {
  return {
    id: p.id.toString(),
    job_id: p.jobId.toString(),
    freelancer_id: p.freelancerId.toString(),
    cover_letter: p.coverLetter,
    bid_amount: p.bidAmount.toString(),
    status: p.status as ProposalRow["status"],
    hive_tx_id: p.hiveTxId,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function toContractRow(c: PrismaContract): ContractRow {
  return {
    id: c.id.toString(),
    job_id: c.jobId.toString(),
    proposal_id: c.proposalId.toString(),
    client_id: c.clientId.toString(),
    freelancer_id: c.freelancerId.toString(),
    total_amount: c.totalAmount.toString(),
    status: c.status as ContractRow["status"],
    completed_by_client: c.completedByClient,
    completed_by_freelancer: c.completedByFreelancer,
    hive_tx_id: c.hiveTxId,
    start_date: c.startDate,
    end_date: c.endDate,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function toPaymentRow(p: PrismaPayment): PaymentRow {
  return {
    id: p.id.toString(),
    contract_id: p.contractId.toString(),
    milestone_id: p.milestoneId.toString(),
    amount: p.amount.toString(),
    currency: p.currency as PaymentRow["currency"],
    status: p.status as PaymentRow["status"],
    escrow_id: p.escrowId,
    hive_tx_id: p.hiveTxId,
    freelancer_approve_tx_id: p.freelancerApproveTxId,
    agent_approve_tx_id: p.agentApproveTxId,
    release_tx_id: p.releaseTxId,
    ratification_deadline: p.ratificationDeadline,
    escrow_expiration: p.escrowExpiration,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

import type { Milestone as PrismaMilestone } from "@prisma/client";
import type { MilestoneRow } from "./types.js";

export function toMilestoneRow(m: PrismaMilestone): MilestoneRow {
  return {
    id: m.id.toString(),
    contract_id: m.contractId.toString(),
    title: m.title,
    description: m.description,
    amount: m.amount.toString(),
    milestone_order: m.milestoneOrder,
    status: m.status as MilestoneRow["status"],
    submitted_at: m.submittedAt,
    approved_at: m.approvedAt,
    hive_tx_id: m.hiveTxId,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}