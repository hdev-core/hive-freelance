import {
  prisma,
  toContractRow,
  toMilestoneRow,
  toPaymentRow,
} from "@hive-freelance/db";
import { BLOCKING_MILESTONE_STATUSES } from "@hive-freelance/shared";
import { AppError } from "../lib/errors.js";
import { lockJobForUpdate } from "../lib/locks.js";

export async function listContracts(userId: string) {
  const uid = BigInt(userId);
  const contracts = await prisma.contract.findMany({
    where: { OR: [{ clientId: uid }, { freelancerId: uid }] },
    orderBy: { updatedAt: "desc" },
  });
  return contracts.map(toContractRow);
}

export async function getContract(contractId: string, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: BigInt(contractId) },
  });
  if (!contract) throw new AppError(404, "Contract not found");
  if (
    contract.clientId.toString() !== userId &&
    contract.freelancerId.toString() !== userId
  ) {
    throw new AppError(403, "Not a party to this contract");
  }

  const [milestones, payments, client, freelancer] = await Promise.all([
    prisma.milestone.findMany({
      where: { contractId: contract.id },
      orderBy: { milestoneOrder: "asc" },
    }),
    prisma.payment.findMany({
      where: { contractId: contract.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: contract.clientId },
      select: { id: true, hiveUsername: true },
    }),
    prisma.user.findUnique({
      where: { id: contract.freelancerId },
      select: { id: true, hiveUsername: true },
    }),
  ]);

  return {
    ...toContractRow(contract),
    milestones: milestones.map(toMilestoneRow),
    payments: payments.map(toPaymentRow),
    parties: {
      client: client
        ? { id: client.id.toString(), hive_username: client.hiveUsername }
        : null,
      freelancer: freelancer
        ? {
            id: freelancer.id.toString(),
            hive_username: freelancer.hiveUsername,
          }
        : null,
    },
  };
}

export async function completeContract(contractId: string, userId: string) {
  // Was a lost-update race: read both flags, mutate one in memory, write
  // both back. Two concurrent calls (client completes, freelancer
  // completes) both read {false, false}, each writes back only their own
  // flag as true and the OTHER flag as the stale false they read —
  // stomping each other. `both` was false in each transaction, so the
  // contract never reached "completed" even after both parties had
  // genuinely signed off, with no error to either caller. Locking the
  // row and reading fresh under the lock closes it: the second caller
  // blocks until the first commits, then sees that flag already true.
  const updated = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      {
        id: bigint;
        client_id: bigint;
        freelancer_id: bigint;
        status: string;
        completed_by_client: boolean;
        completed_by_freelancer: boolean;
      }[]
    >`
      SELECT id, client_id, freelancer_id, status,
             completed_by_client, completed_by_freelancer
      FROM contracts WHERE id = ${BigInt(contractId)} FOR UPDATE
    `;

    const contract = locked[0];
    if (!contract) throw new AppError(404, "Contract not found");
    if (contract.status !== "active") {
      throw new AppError(400, "Contract is not active");
    }

    let completedByClient = contract.completed_by_client;
    let completedByFreelancer = contract.completed_by_freelancer;

    if (contract.client_id.toString() === userId) {
      completedByClient = true;
    } else if (contract.freelancer_id.toString() === userId) {
      completedByFreelancer = true;
    } else {
      throw new AppError(403, "Not a party to this contract");
    }

    const both = completedByClient && completedByFreelancer;
    return tx.contract.update({
      where: { id: contract.id },
      data: {
        completedByClient,
        completedByFreelancer,
        // CASE WHEN $both THEN 'completed' ELSE status END equivalent
        ...(both ? { status: "completed", endDate: new Date() } : {}),
      },
    });
  });

  return toContractRow(updated);
}

export async function cancelContract(contractId: string, userId: string) {
  const contractLookup = await prisma.contract.findUnique({
    where: { id: BigInt(contractId) },
    select: { jobId: true },
  });
  if (!contractLookup) throw new AppError(404, "Contract not found");

  const updated = await prisma.$transaction(
    async (tx) => {
      // Lock the job row first — same order as acceptProposal/cancelJob,
      // so this path can't deadlock against either of them over the same
      // job+contract pair. jobId itself is immutable on a contract once
      // created, so reading it outside the transaction (above) is safe;
      // everything that actually changes gets re-read fresh below, after
      // the lock is held.
      await lockJobForUpdate(tx, contractLookup.jobId.toString());

      const contract = await tx.contract.findUnique({
        where: { id: BigInt(contractId) },
      });
      if (!contract) throw new AppError(404, "Contract not found");
      if (
        contract.clientId.toString() !== userId &&
        contract.freelancerId.toString() !== userId
      ) {
        throw new AppError(403, "Not a party to this contract");
      }
      if (contract.status !== "active") {
        throw new AppError(400, "Contract is not active");
      }

      const blockingMilestone = await tx.milestone.findFirst({
        where: {
          contractId: contract.id,
          status: { in: [...BLOCKING_MILESTONE_STATUSES] },
        },
      });
      if (blockingMilestone) {
        throw new AppError(
          400,
          "Cannot cancel after milestones are funded — use cooperative refund or dispute",
        );
      }

      const updatedContract = await tx.contract.update({
        where: { id: contract.id },
        data: { status: "cancelled", endDate: new Date() },
      });

      // Deliberately NOT touching the job here. Either party (client or
      // freelancer) can call this, so auto-cancelling the job would let
      // a freelancer backing out unilaterally kill the client's listing
      // — terminal, no re-post, no re-accept. Leaving the job at
      // whatever status it's in (pre-existing behavior) is the safer
      // default until the actual job-lifecycle question (what SHOULD
      // happen to the job on contract cancel/complete — reopen? stay
      // in_progress? something else?) gets a real product answer from
      // Mohammad. See also: completeContract has the same gap on the
      // opposite branch.
      return updatedContract;
    },
    // 4 round-trips here — same risk category as cancelJob and
    // acceptProposal, which measured ~5.5s under real pooled-connection
    // latency and tripped the default 5000ms. Same fix, applied
    // proactively rather than waiting to hit it.
    { timeout: 15000 },
  );

  return toContractRow(updated);
}