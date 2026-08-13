import { APP_ID } from "@hive-freelance/shared";
import {
  prisma,
  isUniqueViolation,
  toContractRow,
  toProposalRow,
  toProposalMilestoneRow,
  toMilestoneRow,
  Prisma,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { assertNotSelfContract } from "../middleware/auth.js";
import { lockJobForUpdate } from "../lib/locks.js";
import { getJob } from "./jobs.js";

const milestonesOrder = { orderBy: { milestoneOrder: "asc" as const } };

export async function listProposalsForJob(
  jobId: string,
  clientId: string,
  opts?: { page?: number; limit?: number },
) {
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Only the job client can list proposals");
  }

  // Same page/limit clamping as listJobs (services/jobs.ts): limit capped at
  // 50, page floored at 1.
  const page = Math.max(1, opts?.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
  const skip = (page - 1) * limit;

  const proposals = await prisma.proposal.findMany({
    where: { jobId: BigInt(jobId) },
    include: {
      milestones: milestonesOrder,
      freelancer: {
        select: {
          hiveUsername: true,
          profile: { select: { displayName: true, avatarUrl: true, skills: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip,
  });

  // Batched rating aggregate, same pattern as listJobs's client_rating: one
  // groupBy for every freelancer on this job instead of one query per card.
  const freelancerIds = [...new Set(proposals.map((p) => p.freelancerId))];
  const ratings = freelancerIds.length
    ? await prisma.review.groupBy({
        by: ["revieweeId"],
        where: { revieweeId: { in: freelancerIds } },
        _avg: { rating: true },
        _count: { rating: true },
      })
    : [];
  const ratingByFreelancerId = new Map(
    ratings.map((r) => [r.revieweeId.toString(), { average: r._avg.rating, count: r._count.rating }]),
  );

  const items = proposals.map((p) => {
    const rating = ratingByFreelancerId.get(p.freelancerId.toString()) ?? { average: null, count: 0 };
    return {
      ...toProposalRow(p),
      milestones: p.milestones.map(toProposalMilestoneRow),
      freelancer_username: p.freelancer.hiveUsername,
      freelancer_display_name: p.freelancer.profile?.displayName ?? null,
      freelancer_avatar_url: p.freelancer.profile?.avatarUrl ?? null,
      // Real Profile.skills, first entry only — there is no headline/title
      // field on Profile, so a single skill tag stands in for the
      // freelancer's "role" line instead of inventing one.
      freelancer_top_skill: p.freelancer.profile?.skills?.[0] ?? null,
      freelancer_rating: {
        average: rating.average != null ? Math.round(rating.average * 100) / 100 : null,
        count: rating.count,
      },
    };
  });

  return { items, page, limit };
}

/**
 * The freelancer's own proposals across every job, every status — unlike
 * getDashboard's pendingProposals (pending-only, capped at 50, built for the
 * dashboard overview widget), this is a full listing for the "My Proposals"
 * page. Always scoped to the caller; there's no cross-user case.
 */
export async function listMyProposals(freelancerId: string) {
  const proposals = await prisma.proposal.findMany({
    where: { freelancerId: BigInt(freelancerId) },
    include: {
      job: { select: { title: true, status: true } },
      milestones: milestonesOrder,
      // Only present once a proposal has been accepted and promoted into a
      // Contract — null for pending/rejected proposals. contract_milestones
      // uses the real, 5-state Milestone model (pending/funded/submitted/
      // approved/released), not the proposal-stage ProposalMilestone rows,
      // which have no status at all.
      contract: {
        include: { milestones: { orderBy: { milestoneOrder: "asc" as const } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return proposals.map((p) => ({
    ...toProposalRow(p),
    job_title: p.job.title,
    job_status: p.job.status,
    milestones: p.milestones.map(toProposalMilestoneRow),
    contract_milestones: p.contract ? p.contract.milestones.map(toMilestoneRow) : null,
  }));
}

export type SubmitProposalMilestoneInput = {
  title: string;
  amount: number;
  duration: string;
};

export async function submitProposal(
  jobId: string,
  freelancerId: string,
  data: {
    cover_letter: string;
    bid_amount: number;
    estimated_duration?: string | null;
    available_to_start?: string | null;
    portfolio_links?: { title: string; url: string }[] | null;
    milestones: SubmitProposalMilestoneInput[];
  },
) {
  const job = await getJob(jobId);
  if (job.status !== "open") {
    throw new AppError(400, "Job is not open for proposals");
  }
  assertNotSelfContract(job.client_id, freelancerId);

  // Milestone amounts are the bid's breakdown — they must add up to exactly
  // what the client sees as the total bid, same rule the mockup's sidebar
  // total enforces client-side.
  const milestoneTotal = data.milestones.reduce((sum, m) => sum + m.amount, 0);
  if (Math.round(milestoneTotal * 100) !== Math.round(data.bid_amount * 100)) {
    throw new AppError(
      400,
      "Milestone amounts must sum to the bid amount",
      "MILESTONE_SUM_MISMATCH",
    );
  }

  try {
    const proposal = await prisma.proposal.create({
      data: {
        jobId: BigInt(jobId),
        freelancerId: BigInt(freelancerId),
        coverLetter: data.cover_letter,
        bidAmount: data.bid_amount,
        estimatedDuration: data.estimated_duration ?? null,
        availableToStart: data.available_to_start ?? null,
        portfolioLinks: data.portfolio_links ?? undefined,
        milestones: {
          create: data.milestones.map((m, i) => ({
            title: m.title,
            amount: m.amount,
            duration: m.duration,
            milestoneOrder: i,
          })),
        },
      },
      include: { milestones: milestonesOrder },
    });
    return {
      ...toProposalRow(proposal),
      milestones: proposal.milestones.map(toProposalMilestoneRow),
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "Already proposed on this job");
    }
    throw err;
  }
}

/**
 * KNOWN GAP (tracked separately — see Trello, a prompt follow-up, not a
 * someday one): this reads `status` unlocked, before any transaction.
 * Locking the proposal row inside acceptProposal (see that function)
 * closes the *interleaving* version of this race that used to cause a
 * P2025 leak — a delete that starts while accept's transaction is still
 * running now blocks on the row lock instead of racing accept's own
 * writes. It does NOT close the *sequential* version: once accept
 * commits, the previously-blocked delete proceeds and succeeds against
 * the now-accepted proposal anyway — Prisma's delete has no status
 * guard, so it doesn't matter that the row is no longer "pending".
 * Contract.proposal is onDelete: Cascade, so the contract, its
 * milestones, payments, and reviews all cascade away with it, even
 * though the client may have already broadcast the accept to Hive, with
 * nothing detecting the divergence. Measured at 29/40 randomized races —
 * this is the common outcome, not a corner case. Closing it fully means
 * routing this through the same job-lock-first transaction
 * acceptProposal uses, so the write only proceeds if status is still
 * what was expected when re-checked under the lock — not done in this
 * pass.
 */
export async function withdrawProposal(
  proposalId: string,
  freelancerId: string,
): Promise<void> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: BigInt(proposalId) },
  });
  if (!proposal) throw new AppError(404, "Proposal not found");
  if (proposal.freelancerId.toString() !== freelancerId) {
    throw new AppError(403, "Not your proposal");
  }
  if (proposal.status !== "pending") {
    throw new AppError(400, "Only pending proposals can be withdrawn");
  }
  await prisma.proposal.delete({ where: { id: BigInt(proposalId) } });
}

/** Same known gap as withdrawProposal above — an update instead of a
 * delete, so the consequence is a proposal silently flipped to
 * "rejected" out from under an accept that already committed, rather
 * than a cascade-delete, but the race itself is identical. */
export async function rejectProposal(proposalId: string, clientId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: BigInt(proposalId) },
  });
  if (!proposal) throw new AppError(404, "Proposal not found");

  const job = await getJob(proposal.jobId.toString());
  if (job.client_id !== clientId) {
    throw new AppError(403, "Only the job client can reject");
  }
  if (proposal.status !== "pending") {
    throw new AppError(400, "Proposal is not pending");
  }

  const updated = await prisma.proposal.update({
    where: { id: BigInt(proposalId) },
    data: { status: "rejected" },
  });
  return toProposalRow(updated);
}

/** Shared by acceptProposal (fresh contract) and getAcceptCustomJson (retry
 * after a dropped/cancelled Keychain broadcast) so both send byte-identical
 * custom_json for the same contract. */
function buildContractCreatedCustomJson(contract: {
  id: bigint;
  jobId: bigint;
  proposalId: bigint;
  clientId: bigint;
  freelancerId: bigint;
  totalAmount: Prisma.Decimal;
}) {
  return {
    id: APP_ID,
    json: JSON.stringify({
      app_id: APP_ID,
      type: "contract_created",
      contract_id: contract.id.toString(),
      job_id: contract.jobId.toString(),
      proposal_id: contract.proposalId.toString(),
      client_id: contract.clientId.toString(),
      freelancer_id: contract.freelancerId.toString(),
      total_amount: contract.totalAmount.toString(),
    }),
    required_auths: [] as string[],
    required_posting_auths: [] as string[], // filled by client username on broadcast
  };
}

/**
 * Maps a P2002 from acceptProposal's transaction to the right 409, by
 * which constraint actually fired:
 *  - contracts_proposal_id_key: this exact proposal already has a
 *    contract (double-accept of the same proposal).
 *  - idx_contracts_active_per_job: the same-job race — two different
 *    proposals both made it past the row locks (shouldn't happen given
 *    the locking in acceptProposal, but this is the backstop, not the
 *    primary defense — and errors.ts's 40P01 handler covers the deadlock
 *    case this index doesn't).
 * Any other error passes through unchanged.
 */
function rethrowAcceptConflict(err: unknown): never {
  if (isUniqueViolation(err)) {
    const target =
      err instanceof Prisma.PrismaClientKnownRequestError
        ? err.meta?.target
        : undefined;
    const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "");
    if (targetStr.includes("proposal_id")) {
      throw new AppError(409, "This proposal has already been accepted");
    }
    throw new AppError(409, "This job already has an active contract");
  }
  throw err;
}

export async function acceptProposal(proposalId: string, clientId: string) {
  // jobId is immutable on a proposal once created, so this lookup is safe
  // outside the transaction — same pattern as cancelContract's
  // contractLookup.
  const proposalLookup = await prisma.proposal.findUnique({
    where: { id: BigInt(proposalId) },
    select: { jobId: true },
  });
  if (!proposalLookup) throw new AppError(404, "Proposal not found");

  const contract = await prisma.$transaction(
    async (tx) => {
      // Job row locked first, via the same shared helper every mutating
      // path uses (acceptProposal, cancelJob, deleteJob, updateJob,
      // cancelContract) — see locks.ts for the ordering contract this
      // establishes.
      const job = await lockJobForUpdate(tx, proposalLookup.jobId.toString());

      // Proposal row is ALSO locked, after the job lock (same jobs ->
      // proposals ordering used everywhere else, so no deadlock risk
      // against any other path). This isn't optional: withdrawProposal
      // and rejectProposal both mutate/delete a proposal with no lock and
      // no transaction of their own, so a Withdraw racing this Accept can
      // land between an unlocked read and the update below — Prisma then
      // throws P2025 on a row that's disappeared out from under it, which
      // isn't a unique violation, so it falls through to the generic 500
      // handler and leaks the server file path to the client.
      const lockedProposal = await tx.$queryRaw<
        {
          id: bigint;
          job_id: bigint;
          freelancer_id: bigint;
          bid_amount: Prisma.Decimal;
          status: string;
        }[]
      >`SELECT id, job_id, freelancer_id, bid_amount, status FROM proposals WHERE id = ${BigInt(proposalId)} FOR UPDATE`;

      const row = lockedProposal[0];
      if (!row) throw new AppError(404, "Proposal not found");
      const proposal = {
        id: row.id,
        jobId: row.job_id,
        freelancerId: row.freelancer_id,
        bidAmount: row.bid_amount,
        status: row.status,
      };

      // Not part of either lock above: proposal milestones are written
      // once at submitProposal and never mutated afterward (no
      // edit-proposal endpoint exists), so there's nothing concurrent to
      // guard against here — a plain read is enough.
      const proposalMilestones = await tx.proposalMilestone.findMany({
        where: { proposalId: proposal.id },
        orderBy: { milestoneOrder: "asc" },
      });

      // Ownership checked first, before any job/proposal state is revealed —
      // same ordering fix as getAcceptCustomJson, otherwise a non-owner
      // client could probe a proposal id and learn whether the job is still
      // open or the proposal still pending before hitting a 403.
      if (job.client_id !== clientId) {
        throw new AppError(403, "Only the job client can accept");
      }
      if (job.status !== "open") {
        throw new AppError(409, "This job is no longer open.");
      }
      if (proposal.status !== "pending") {
        throw new AppError(400, "Proposal is not pending");
      }
      assertNotSelfContract(job.client_id, proposal.freelancerId.toString());

      await tx.proposal.update({
        where: { id: proposal.id },
        data: { status: "accepted" },
      });
      await tx.proposal.updateMany({
        where: {
          jobId: proposal.jobId,
          id: { not: proposal.id },
          status: "pending",
        },
        data: { status: "rejected" },
      });
      await tx.job.update({
        where: { id: proposal.jobId },
        data: { status: "in_progress" },
      });

      const contract = await tx.contract.create({
        data: {
          jobId: proposal.jobId,
          proposalId: proposal.id,
          clientId: BigInt(job.client_id),
          freelancerId: proposal.freelancerId,
          totalAmount: proposal.bidAmount,
          status: "active",
          startDate: new Date(),
        },
      });

      // Promote proposal-stage milestones into real, trackable rows on the
      // new contract. Only title/amount/order carry over — `duration` is
      // deliberately dropped: it's proposal-stage-only, non-binding
      // information, and the real Milestone table has no field for it
      // (see ProposalMilestone's model comment in schema.prisma).
      if (proposalMilestones.length > 0) {
        await tx.milestone.createMany({
          data: proposalMilestones.map((m) => ({
            contractId: contract.id,
            title: m.title,
            amount: m.amount,
            milestoneOrder: m.milestoneOrder,
          })),
        });
      }

      return contract;
    },
    // Default is 5000ms — observed real-world latency through the pooled
    // connection came in at ~5.5s for this transaction's round-trips,
    // tripping the default. 15000ms keeps comfortable headroom for
    // pooler/connection latency, not per-statement query cost.
    { timeout: 15000 },
  ).catch(rethrowAcceptConflict);

  const custom_json = buildContractCreatedCustomJson(contract);

  return { contract: toContractRow(contract), custom_json };
}

export async function confirmAccept(
  proposalId: string,
  clientId: string,
  hiveTxId: string,
) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: BigInt(proposalId) },
  });
  if (!proposal) throw new AppError(404, "Proposal not found");

  const existingContract = await prisma.contract.findUnique({
    where: { proposalId: BigInt(proposalId) },
  });
  if (!existingContract) throw new AppError(404, "Contract not found");
  if (existingContract.clientId.toString() !== clientId) {
    throw new AppError(403, "Only the client can confirm");
  }

  await prisma.proposal.update({
    where: { id: BigInt(proposalId) },
    data: { hiveTxId },
  });
  const updated = await prisma.contract.update({
    where: { id: existingContract.id },
    data: { hiveTxId },
  });
  return toContractRow(updated);
}

/**
 * Re-issues the same custom_json acceptProposal already returned, for the
 * "accepted but the client cancelled/lost the Keychain broadcast" dead end:
 * the contract row already exists with no hive_tx_id, so this can't call
 * acceptProposal again (proposal is no longer `pending`) — it just hands
 * back the payload to retry the broadcast + confirmAccept with.
 */
export async function getAcceptCustomJson(proposalId: string, clientId: string) {
  // Ownership is checked before anything else about the proposal's state is
  // revealed — otherwise any authenticated client could probe proposal IDs
  // and learn whether they're accepted/confirmed before being rejected.
  const contract = await prisma.contract.findUnique({
    where: { proposalId: BigInt(proposalId) },
  });
  if (!contract) throw new AppError(404, "Contract not found");
  if (contract.clientId.toString() !== clientId) {
    throw new AppError(403, "Only the client can confirm");
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id: BigInt(proposalId) },
  });
  if (!proposal) throw new AppError(404, "Proposal not found");
  if (proposal.status !== "accepted") {
    throw new AppError(400, "Proposal is not accepted");
  }
  if (proposal.hiveTxId) {
    throw new AppError(400, "Proposal is already confirmed on-chain");
  }

  return { custom_json: buildContractCreatedCustomJson(contract) };
}
