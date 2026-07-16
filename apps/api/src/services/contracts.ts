import { getPool, type ContractRow, type MilestoneRow } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";

export async function listContracts(userId: string) {
  const result = await getPool().query<ContractRow>(
    `
    SELECT * FROM contracts
    WHERE client_id = $1 OR freelancer_id = $1
    ORDER BY updated_at DESC
    `,
    [userId],
  );
  return result.rows;
}

export async function getContract(contractId: string, userId: string) {
  const pool = getPool();
  const result = await pool.query<ContractRow>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );
  const contract = result.rows[0];
  if (!contract) throw new AppError(404, "Contract not found");
  if (contract.client_id !== userId && contract.freelancer_id !== userId) {
    throw new AppError(403, "Not a party to this contract");
  }

  const milestones = await pool.query<MilestoneRow>(
    `SELECT * FROM milestones WHERE contract_id = $1 ORDER BY milestone_order ASC`,
    [contractId],
  );
  const payments = await pool.query(
    `SELECT * FROM payments WHERE contract_id = $1 ORDER BY created_at ASC`,
    [contractId],
  );

  return {
    ...contract,
    milestones: milestones.rows,
    payments: payments.rows,
  };
}

export async function completeContract(contractId: string, userId: string) {
  const pool = getPool();
  const result = await pool.query<ContractRow>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );
  const contract = result.rows[0];
  if (!contract) throw new AppError(404, "Contract not found");
  if (contract.status !== "active") {
    throw new AppError(400, "Contract is not active");
  }

  let completedByClient = contract.completed_by_client;
  let completedByFreelancer = contract.completed_by_freelancer;

  if (contract.client_id === userId) {
    completedByClient = true;
  } else if (contract.freelancer_id === userId) {
    completedByFreelancer = true;
  } else {
    throw new AppError(403, "Not a party to this contract");
  }

  const both = completedByClient && completedByFreelancer;
  const updated = await pool.query<ContractRow>(
    `
    UPDATE contracts SET
      completed_by_client = $2,
      completed_by_freelancer = $3,
      status = CASE WHEN $4 THEN 'completed' ELSE status END,
      end_date = CASE WHEN $4 THEN now() ELSE end_date END
    WHERE id = $1
    RETURNING *
    `,
    [contractId, completedByClient, completedByFreelancer, both],
  );
  return updated.rows[0]!;
}

const BLOCKING_MILESTONE = ["funded", "submitted", "approved", "released"];

export async function cancelContract(contractId: string, userId: string) {
  const pool = getPool();
  const result = await pool.query<ContractRow>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );
  const contract = result.rows[0];
  if (!contract) throw new AppError(404, "Contract not found");
  if (contract.client_id !== userId && contract.freelancer_id !== userId) {
    throw new AppError(403, "Not a party to this contract");
  }
  if (contract.status !== "active") {
    throw new AppError(400, "Contract is not active");
  }

  const funded = await pool.query(
    `
    SELECT 1 FROM milestones
    WHERE contract_id = $1 AND status = ANY($2::text[])
    LIMIT 1
    `,
    [contractId, BLOCKING_MILESTONE],
  );
  if ((funded.rowCount ?? 0) > 0) {
    throw new AppError(
      400,
      "Cannot cancel after milestones are funded — use cooperative refund or dispute",
    );
  }

  const updated = await pool.query<ContractRow>(
    `UPDATE contracts SET status = 'cancelled', end_date = now() WHERE id = $1 RETURNING *`,
    [contractId],
  );
  return updated.rows[0]!;
}
