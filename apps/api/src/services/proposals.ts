import { APP_ID } from "@hive-freelance/shared";
import {
  prisma,
  isUniqueViolation,
  toContractRow,
  toProposalRow,
  type Prisma,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { getJob } from "./jobs.js";

export async function listProposalsForJob(jobId: string, clientId: string) {
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Only the job client can list proposals");
  }
  const proposals = await prisma.proposal.findMany({
    where: { jobId: BigInt(jobId) },
    orderBy: { createdAt: "desc" },
  });
  return proposals.map(toProposalRow);
}

export async function submitProposal(
  jobId: string,
  freelancerId: string,
  data: { cover_letter: string; bid_amount: number },
) {
  const job = await getJob(jobId);
  if (job.status !== "open") {
    throw new AppError(400, "Job is not open for proposals");
  }
  if (job.client_id === freelancerId) {
    throw new AppError(403, "Cannot propose on your own job");
  }

  try {
    const proposal = await prisma.proposal.create({
      data: {
        jobId: BigInt(jobId),
        freelancerId: BigInt(freelancerId),
        coverLetter: data.cover_letter,
        bidAmount: data.bid_amount,
      },
    });
    return toProposalRow(proposal);
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

      const job = await tx.job.findUnique({ where: { id: proposal.job_id } });
      if (!job) throw new AppError(404, "Job not found");
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

      return tx.contract.create({
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
    },
    // Default is 5000ms — observed real-world latency through the pooled
    // connection came in at ~5.5s for this transaction's six round-trips,
    // tripping the default and closing the transaction before the final
    // statement ran. Six small statements shouldn't need 15s of DB work;
    // this headroom is for connection/pooler latency, not query cost.
    { timeout: 15000 },
  );

  const custom_json = {
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
    required_auths: [],
    required_posting_auths: [], // filled by client username on broadcast
  };

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