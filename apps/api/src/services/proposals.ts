import { APP_ID } from "@hive-freelance/shared";
import {
  prisma,
  isUniqueViolation,
  toContractRow,
  toProposalRow,
  Prisma,
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

function rethrowAcceptConflict(err: unknown): never {
  if (isUniqueViolation(err)) {
    const target =
      err instanceof Prisma.PrismaClientKnownRequestError
        ? err.meta?.target
        : undefined;
    const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "");
    if (targetStr.includes("proposal_id")) {
      // contracts_proposal_id_key — this exact proposal already has a
      // contract (double-accept of the same proposal), not the
      // same-job race the partial index guards against.
      throw new AppError(409, "This proposal has already been accepted");
    }
    // idx_contracts_active_per_job — the actual same-job race: two
    // different proposals both made it past the row locks (shouldn't
    // happen given the locking above, but this is the backstop).
    throw new AppError(409, "This job already has an active contract");
  }
  throw err;
}

/**
 * Locks both the proposal AND job rows (plain `FOR UPDATE` on the join,
 * not `FOR UPDATE OF j`) for the duration of the transaction.
 *
 * The job lock is what actually closes the main race: two different
 * proposals on the *same* job are two different proposal rows, so
 * locking per-proposal alone (the original approach) let both accepts
 * through in parallel, each creating its own contract. Locking the job
 * row serializes them — the second one to run sees the job already
 * flipped to in_progress and is rejected by the status guard below.
 *
 * The proposal row also needs to be in the lock set: under READ
 * COMMITTED, once the second transaction unblocks it re-reads the job
 * row fresh (so the job-status guard is race-safe on its own), but a
 * row that's only *read*, not locked, would still reflect this
 * transaction's original snapshot — so `proposal.status !== "pending"`
 * needs the proposal row locked too, not just observed.
 *
 * Correctness here depends on READ COMMITTED (the default, and not
 * changed anywhere in this codebase). If the isolation level is ever
 * raised, the second transaction gets a 40001 serialization failure
 * instead of a clean 409 — worth revisiting this comment if that ever
 * changes.
 *
 * The job lookup is folded into the same raw query as a JOIN, saving a
 * round-trip that a separate `tx.job.findUnique` would otherwise cost.
 *
 * `Contract.proposalId @unique` does NOT protect against the main race,
 * since two different proposals (and therefore two contracts) have
 * different proposalIds — it only prevents double-accepting the *same*
 * proposal. The row locks above are what actually close the race; the
 * partial unique index on `contracts(job_id) WHERE status = 'active'`
 * (see migration) is defense-in-depth on top of that, and the
 * `contracts_proposal_id_key` unique constraint is a second, separate
 * safety net for the double-accept case — both mapped to 409 below,
 * distinguished by which constraint actually fired.
 */
export async function acceptProposal(proposalId: string, clientId: string) {
  const contract = await prisma
    .$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          {
            id: bigint;
            job_id: bigint;
            freelancer_id: bigint;
            bid_amount: Prisma.Decimal;
            status: string;
            client_id: bigint;
            job_status: string;
          }[]
        >`
          SELECT p.id, p.job_id, p.freelancer_id, p.bid_amount, p.status,
                 j.client_id, j.status AS job_status
          FROM proposals p
          JOIN jobs j ON j.id = p.job_id
          WHERE p.id = ${BigInt(proposalId)}
          FOR UPDATE
        `;

        const proposal = locked[0];
        if (!proposal) throw new AppError(404, "Proposal not found");
        if (proposal.client_id.toString() !== clientId) {
          throw new AppError(403, "Only the job client can accept");
        }
        if (proposal.job_status !== "open") {
          throw new AppError(409, "Job is not open");
        }
        if (proposal.status !== "pending") {
          throw new AppError(400, "Proposal is not pending");
        }
        if (proposal.client_id === proposal.freelancer_id) {
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
            clientId: proposal.client_id,
            freelancerId: proposal.freelancer_id,
            totalAmount: proposal.bid_amount,
            status: "active",
            startDate: new Date(),
          },
        });
      },
      // Default is 5000ms — observed real-world latency through the pooled
      // connection came in at ~5.5s for this transaction's round-trips,
      // tripping the default and closing the transaction before the final
      // statement ran. This headroom is for connection/pooler latency,
      // not query cost.
      { timeout: 15000 },
    )
    .catch(rethrowAcceptConflict);

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