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
import { lockJobForUpdate } from "../lib/locks.js";
import { getJob } from "./jobs.js";

const milestonesOrder = { orderBy: { milestoneOrder: "asc" as const } };

export async function listProposalsForJob(jobId: string, clientId: string) {
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Only the job client can list proposals");
  }
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
  });

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

  return proposals.map((p) => {
    const rating = ratingByFreelancerId.get(p.freelancerId.toString()) ?? { average: null, count: 0 };
    return {
      ...toProposalRow(p),
      milestones: p.milestones.map(toProposalMilestoneRow),
      freelancer_username: p.freelancer.hiveUsername,
      freelancer_display_name: p.freelancer.profile?.displayName ?? null,
      freelancer_avatar_url: p.freelancer.profile?.avatarUrl ?? null,
      freelancer_top_skill: p.freelancer.profile?.skills?.[0] ?? null,
      freelancer_rating: {
        average: rating.average != null ? Math.round(rating.average * 100) / 100 : null,
        count: rating.count,
      },
    };
  });
}

export async function listMyProposals(freelancerId: string) {
  const proposals = await prisma.proposal.findMany({
    where: { freelancerId: BigInt(freelancerId) },
    include: {
      job: { select: { title: true, status: true } },
      milestones: milestonesOrder,
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
  if (job.client_id === freelancerId) {
    throw new AppError(403, "Cannot propose on your own job");
  }

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
 *    proposals both made it past the row lock (shouldn't happen given
 *    lockJobForUpdate below, but this is the backstop, not the primary
 *    defense — and errors.ts's 40P01 handler covers the deadlock case
 *    this index doesn't).
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
  // contractLookup. Everything that actually matters (status, ownership)
  // is re-read fresh inside the transaction, after the job row is locked.
  const proposalLookup = await prisma.proposal.findUnique({
    where: { id: BigInt(proposalId) },
    select: { jobId: true },
  });
  if (!proposalLookup) throw new AppError(404, "Proposal not found");

  const contract = await prisma.$transaction(
    async (tx) => {
      // Single locking strategy across the whole file: the job row is
      // locked first, always, via the same shared helper every mutating
      // path uses (acceptProposal, cancelJob, deleteJob, updateJob,
      // cancelContract) — see locks.ts for the ordering contract this
      // establishes and why it prevents the 40P01 deadlock rather than
      // just catching it after the fact (see errors.ts).
      const job = await lockJobForUpdate(tx, proposalLookup.jobId.toString());

      // Read as of *this* statement under READ COMMITTED (not the
      // transaction's start) — since nothing can write to any proposal on
      // this job without first holding the job lock above, this is
      // guaranteed fresh, not a stale snapshot from before the lock.
      const proposal = await tx.proposal.findUnique({
        where: { id: BigInt(proposalId) },
      });
      if (!proposal) throw new AppError(404, "Proposal not found");

      // Not part of the lock above: proposal milestones are written once
      // at submitProposal and never mutated afterward (no edit-proposal
      // endpoint exists), so there's nothing concurrent to guard against
      // here — a plain read is enough.
      const proposalMilestones = await tx.proposalMilestone.findMany({
        where: { proposalId: proposal.id },
        orderBy: { milestoneOrder: "asc" },
      });

      if (job.status !== "open") {
        throw new AppError(409, "This job is no longer open.");
      }
      if (job.client_id !== clientId) {
        throw new AppError(403, "Only the job client can accept");
      }
      if (proposal.status !== "pending") {
        throw new AppError(400, "Proposal is not pending");
      }
      if (job.client_id === proposal.freelancerId.toString()) {
        throw new AppError(
          403,
          "Cannot be both client and freelancer on the same contract",
          "SELF_CONTRACT",
        );
      }

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
    // tripping the default. This version has a couple more round-trips
    // than the original measurement (separate fresh proposal read,
    // milestone lookup + promotion) — 15000ms keeps comfortable headroom
    // for pooler/connection latency, not per-statement query cost.
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