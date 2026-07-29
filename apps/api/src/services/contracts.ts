import {
  prisma,
  toContractRow,
  toMilestoneRow,
  toPaymentRow,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";

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
  const contract = await prisma.contract.findUnique({
    where: { id: BigInt(contractId) },
  });
  if (!contract) throw new AppError(404, "Contract not found");
  if (contract.status !== "active") {
    throw new AppError(400, "Contract is not active");
  }

  let completedByClient = contract.completedByClient;
  let completedByFreelancer = contract.completedByFreelancer;

  if (contract.clientId.toString() === userId) {
    completedByClient = true;
  } else if (contract.freelancerId.toString() === userId) {
    completedByFreelancer = true;
  } else {
    throw new AppError(403, "Not a party to this contract");
  }

  const both = completedByClient && completedByFreelancer;
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      completedByClient,
      completedByFreelancer,
      // CASE WHEN $both THEN 'completed' ELSE status END equivalent
      ...(both ? { status: "completed", endDate: new Date() } : {}),
    },
  });
  return toContractRow(updated);
}

const BLOCKING_MILESTONE = ["funded", "submitted", "approved", "released"];

export async function cancelContract(contractId: string, userId: string) {
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
  if (contract.status !== "active") {
    throw new AppError(400, "Contract is not active");
  }

  const blockingMilestone = await prisma.milestone.findFirst({
    where: { contractId: contract.id, status: { in: BLOCKING_MILESTONE } },
  });
  if (blockingMilestone) {
    throw new AppError(
      400,
      "Cannot cancel after milestones are funded — use cooperative refund or dispute",
    );
  }

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: { status: "cancelled", endDate: new Date() },
  });
  return toContractRow(updated);
}