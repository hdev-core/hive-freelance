import { APP_ID } from "@hive-freelance/shared";
import { prisma, toMilestoneRow } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";

async function getContractOrThrow(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: BigInt(contractId) },
  });
  if (!contract) throw new AppError(404, "Contract not found");
  return contract;
}

export async function listMilestones(contractId: string, userId: string) {
  const contract = await getContractOrThrow(contractId);
  if (
    contract.clientId.toString() !== userId &&
    contract.freelancerId.toString() !== userId
  ) {
    throw new AppError(403, "Not a party to this contract");
  }
  const milestones = await prisma.milestone.findMany({
    where: { contractId: contract.id },
    orderBy: { milestoneOrder: "asc" },
  });
  return milestones.map(toMilestoneRow);
}

export async function createMilestone(
  contractId: string,
  clientId: string,
  data: {
    title: string;
    description?: string;
    amount: number;
    milestone_order: number;
  },
) {
  const contract = await getContractOrThrow(contractId);
  if (contract.clientId.toString() !== clientId) {
    throw new AppError(403, "Only the client can create milestones");
  }
  if (contract.status !== "active") {
    throw new AppError(400, "Contract is not active");
  }

  const milestone = await prisma.milestone.create({
    data: {
      contractId: contract.id,
      title: data.title,
      description: data.description ?? null,
      amount: data.amount,
      milestoneOrder: data.milestone_order,
    },
  });
  return toMilestoneRow(milestone);
}

export async function submitMilestone(
  milestoneId: string,
  freelancerId: string,
) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: BigInt(milestoneId) },
  });
  if (!milestone) throw new AppError(404, "Milestone not found");

  const contract = await getContractOrThrow(milestone.contractId.toString());
  if (contract.freelancerId.toString() !== freelancerId) {
    throw new AppError(403, "Only the freelancer can submit");
  }
  if (!["funded", "pending"].includes(milestone.status)) {
    throw new AppError(400, `Cannot submit from status ${milestone.status}`);
  }

  const updated = await prisma.milestone.update({
    where: { id: milestone.id },
    data: { status: "submitted", submittedAt: new Date() },
  });
  return toMilestoneRow(updated);
}

export async function approveMilestone(milestoneId: string, clientId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: BigInt(milestoneId) },
  });
  if (!milestone) throw new AppError(404, "Milestone not found");

  const contract = await getContractOrThrow(milestone.contractId.toString());
  if (contract.clientId.toString() !== clientId) {
    throw new AppError(403, "Only the client can approve");
  }
  if (milestone.status !== "submitted") {
    throw new AppError(400, "Milestone must be submitted before approval");
  }

  const milestoneRow = toMilestoneRow(milestone);
  const custom_json = {
    id: APP_ID,
    json: JSON.stringify({
      app_id: APP_ID,
      type: "milestone_approved",
      milestone_id: milestoneRow.id,
      contract_id: milestoneRow.contract_id,
      amount: milestoneRow.amount,
    }),
    required_auths: [],
    required_posting_auths: [],
  };

  return { milestone: milestoneRow, custom_json };
}

export async function confirmApprove(
  milestoneId: string,
  clientId: string,
  hiveTxId: string,
) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: BigInt(milestoneId) },
  });
  if (!milestone) throw new AppError(404, "Milestone not found");

  const contract = await getContractOrThrow(milestone.contractId.toString());
  if (contract.clientId.toString() !== clientId) {
    throw new AppError(403, "Only the client can confirm approval");
  }

  const updated = await prisma.milestone.update({
    where: { id: milestone.id },
    data: { status: "approved", approvedAt: new Date(), hiveTxId },
  });
  return toMilestoneRow(updated);
}

export async function getMilestone(milestoneId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: BigInt(milestoneId) },
  });
  if (!milestone) throw new AppError(404, "Milestone not found");
  return toMilestoneRow(milestone);
}