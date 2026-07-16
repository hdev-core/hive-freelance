import { APP_ID } from "@hive-freelance/shared";
import { getPool, type ContractRow, type MilestoneRow } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";

async function getContractOrThrow(contractId: string): Promise<ContractRow> {
  const result = await getPool().query<ContractRow>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );
  const contract = result.rows[0];
  if (!contract) throw new AppError(404, "Contract not found");
  return contract;
}

export async function listMilestones(contractId: string, userId: string) {
  const contract = await getContractOrThrow(contractId);
  if (contract.client_id !== userId && contract.freelancer_id !== userId) {
    throw new AppError(403, "Not a party to this contract");
  }
  const result = await getPool().query<MilestoneRow>(
    `SELECT * FROM milestones WHERE contract_id = $1 ORDER BY milestone_order ASC`,
    [contractId],
  );
  return result.rows;
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
): Promise<MilestoneRow> {
  const contract = await getContractOrThrow(contractId);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can create milestones");
  }
  if (contract.status !== "active") {
    throw new AppError(400, "Contract is not active");
  }

  const result = await getPool().query<MilestoneRow>(
    `
    INSERT INTO milestones (contract_id, title, description, amount, milestone_order)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      contractId,
      data.title,
      data.description ?? null,
      data.amount,
      data.milestone_order,
    ],
  );
  return result.rows[0]!;
}

export async function submitMilestone(milestoneId: string, freelancerId: string) {
  const pool = getPool();
  const result = await pool.query<MilestoneRow>(
    `SELECT * FROM milestones WHERE id = $1`,
    [milestoneId],
  );
  const milestone = result.rows[0];
  if (!milestone) throw new AppError(404, "Milestone not found");

  const contract = await getContractOrThrow(milestone.contract_id);
  if (contract.freelancer_id !== freelancerId) {
    throw new AppError(403, "Only the freelancer can submit");
  }
  if (milestone.status !== "funded" && milestone.status !== "pending") {
    // Allow submit after funded (typical) or pending if unfunded work — prefer funded
  }
  if (!["funded", "pending"].includes(milestone.status)) {
    throw new AppError(400, `Cannot submit from status ${milestone.status}`);
  }

  const updated = await pool.query<MilestoneRow>(
    `
    UPDATE milestones
    SET status = 'submitted', submitted_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [milestoneId],
  );
  return updated.rows[0]!;
}

export async function approveMilestone(milestoneId: string, clientId: string) {
  const pool = getPool();
  const result = await pool.query<MilestoneRow>(
    `SELECT * FROM milestones WHERE id = $1`,
    [milestoneId],
  );
  const milestone = result.rows[0];
  if (!milestone) throw new AppError(404, "Milestone not found");

  const contract = await getContractOrThrow(milestone.contract_id);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can approve");
  }
  if (milestone.status !== "submitted") {
    throw new AppError(400, "Milestone must be submitted before approval");
  }

  const custom_json = {
    id: APP_ID,
    json: JSON.stringify({
      app_id: APP_ID,
      type: "milestone_approved",
      milestone_id: milestone.id,
      contract_id: milestone.contract_id,
      amount: milestone.amount,
    }),
    required_auths: [],
    required_posting_auths: [],
  };

  return { milestone, custom_json };
}

export async function confirmApprove(
  milestoneId: string,
  clientId: string,
  hiveTxId: string,
) {
  const pool = getPool();
  const result = await pool.query<MilestoneRow>(
    `SELECT * FROM milestones WHERE id = $1`,
    [milestoneId],
  );
  const milestone = result.rows[0];
  if (!milestone) throw new AppError(404, "Milestone not found");

  const contract = await getContractOrThrow(milestone.contract_id);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can confirm approval");
  }

  const updated = await pool.query<MilestoneRow>(
    `
    UPDATE milestones
    SET status = 'approved', approved_at = now(), hive_tx_id = $2
    WHERE id = $1
    RETURNING *
    `,
    [milestoneId, hiveTxId],
  );
  return updated.rows[0]!;
}

export async function getMilestone(milestoneId: string): Promise<MilestoneRow> {
  const result = await getPool().query<MilestoneRow>(
    `SELECT * FROM milestones WHERE id = $1`,
    [milestoneId],
  );
  if (!result.rows[0]) throw new AppError(404, "Milestone not found");
  return result.rows[0];
}
