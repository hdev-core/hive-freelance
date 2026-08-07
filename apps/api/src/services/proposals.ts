import { APP_ID } from "@hive-freelance/shared";
import {
  prisma,
  isUniqueViolation,
  toContractRow,
  toProposalRow,
  toProposalMilestoneRow,
  toMilestoneRow,
  type Prisma,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
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

  return proposals.map((p) => {
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
  if (job.client_id === freelancerId) {
    throw new AppError(403, "Cannot propose on your own job");
  }

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
 * Preserves the original's pessimistic locking: two clients accepting
 * different proposals on the same job at the same instant must not both
 * succeed. The original used `SELECT ... FOR UPDATE` inside a manual
 * BEGIN/COMMIT/ROLLBACK; Prisma's typed API has no FOR UPDATE, so the lock
 * itself is a raw query run *inside* a Prisma interactive transaction —
 * everything after it (the actual writes) uses the normal typed API, still
 * inside the same transaction. Throwing anywhere in here rolls the whole
 * thing back automatically, same as the original's catch/ROLLBACK.
 */
export async function acceptProposal(proposalId: string, clientId: string) {
  const contract = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: bigint;
          job_id: bigint;
          freelancer_id: bigint;
          bid_amount: Prisma.Decimal;
          status: string;
        }[]
      >`SELECT id, job_id, freelancer_id, bid_amount, status FROM proposals WHERE id = ${BigInt(proposalId)} FOR UPDATE`;

      const proposal = locked[0];
      if (!proposal) throw new AppError(404, "Proposal not found");

      // Not part of the FOR UPDATE lock above: proposal milestones are
      // written once at submitProposal and never mutated afterward (no
      // edit-proposal endpoint exists), so there's nothing concurrent to
      // guard against here — a plain typed read is enough.
      const proposalMilestones = await tx.proposalMilestone.findMany({
        where: { proposalId: proposal.id },
        orderBy: { milestoneOrder: "asc" },
      });

      const job = await tx.job.findUnique({ where: { id: proposal.job_id } });
      if (!job) throw new AppError(404, "Job not found");
      if (job.status !== "open") {
        throw new AppError(409, "This job is no longer open.");
      }
      if (job.clientId.toString() !== clientId) {
        throw new AppError(403, "Only the job client can accept");
      }
      if (proposal.status !== "pending") {
        throw new AppError(400, "Proposal is not pending");
      }
      if (job.clientId === proposal.freelancer_id) {
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
          jobId: proposal.job_id,
          id: { not: proposal.id },
          status: "pending",
        },
        data: { status: "rejected" },
      });
      await tx.job.update({
        where: { id: proposal.job_id },
        data: { status: "in_progress" },
      });

      const contract = await tx.contract.create({
        data: {
          jobId: proposal.job_id,
          proposalId: proposal.id,
          clientId: job.clientId,
          freelancerId: proposal.freelancer_id,
          totalAmount: proposal.bid_amount,
          status: "active",
          startDate: new Date(),
        },
      });

      // Promote proposal-stage milestones into real, trackable rows on the
      // new contract. Only title/amount/order carry over — `duration` is
      // deliberately dropped: it's proposal-stage-only, non-binding
      // information, and the real Milestone table has no field for it (see
      // ProposalMilestone's model comment in schema.prisma). createMany is
      // one extra round-trip regardless of milestone count, same reasoning
      // as the timeout comment below — six round-trips became seven.
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
    // connection came in at ~5.5s for this transaction's six round-trips,
    // tripping the default and closing the transaction before the final
    // statement ran. Six small statements shouldn't need 15s of DB work;
    // this headroom is for connection/pooler latency, not query cost.
    // Still 15000ms after adding the milestone lookup/promotion (two more
    // round-trips, one read + one batched write) — headroom was sized for
    // pooler/connection latency, not per-statement query cost, so it has
    // slack for this. Revisit if proposals start carrying many more
    // milestones than the UI's current handful.
    { timeout: 15000 },
  );

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

  const contract = await prisma.contract.findUnique({
    where: { proposalId: BigInt(proposalId) },
  });
  if (!contract) throw new AppError(404, "Contract not found");
  if (contract.clientId.toString() !== clientId) {
    throw new AppError(403, "Only the client can confirm");
  }

  return { custom_json: buildContractCreatedCustomJson(contract) };
}