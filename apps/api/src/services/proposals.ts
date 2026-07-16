import { APP_ID } from "@hive-freelance/shared";
import {
  getPool,
  type ContractRow,
  type ProposalRow,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { getJob } from "./jobs.js";

export async function listProposalsForJob(jobId: string, clientId: string) {
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Only the job client can list proposals");
  }
  const result = await getPool().query<ProposalRow>(
    `SELECT * FROM proposals WHERE job_id = $1 ORDER BY created_at DESC`,
    [jobId],
  );
  return result.rows;
}

export async function submitProposal(
  jobId: string,
  freelancerId: string,
  data: { cover_letter: string; bid_amount: number },
): Promise<ProposalRow> {
  const job = await getJob(jobId);
  if (job.status !== "open") {
    throw new AppError(400, "Job is not open for proposals");
  }
  if (job.client_id === freelancerId) {
    throw new AppError(403, "Cannot propose on your own job");
  }

  try {
    const result = await getPool().query<ProposalRow>(
      `
      INSERT INTO proposals (job_id, freelancer_id, cover_letter, bid_amount)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [jobId, freelancerId, data.cover_letter, data.bid_amount],
    );
    return result.rows[0]!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      throw new AppError(409, "Already proposed on this job");
    }
    throw err;
  }
}

export async function withdrawProposal(
  proposalId: string,
  freelancerId: string,
): Promise<void> {
  const result = await getPool().query<ProposalRow>(
    `SELECT * FROM proposals WHERE id = $1`,
    [proposalId],
  );
  const proposal = result.rows[0];
  if (!proposal) throw new AppError(404, "Proposal not found");
  if (proposal.freelancer_id !== freelancerId) {
    throw new AppError(403, "Not your proposal");
  }
  if (proposal.status !== "pending") {
    throw new AppError(400, "Only pending proposals can be withdrawn");
  }
  await getPool().query(`DELETE FROM proposals WHERE id = $1`, [proposalId]);
}

export async function rejectProposal(proposalId: string, clientId: string) {
  const pool = getPool();
  const result = await pool.query<ProposalRow>(
    `SELECT * FROM proposals WHERE id = $1`,
    [proposalId],
  );
  const proposal = result.rows[0];
  if (!proposal) throw new AppError(404, "Proposal not found");

  const job = await getJob(proposal.job_id);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Only the job client can reject");
  }
  if (proposal.status !== "pending") {
    throw new AppError(400, "Proposal is not pending");
  }

  const updated = await pool.query<ProposalRow>(
    `UPDATE proposals SET status = 'rejected' WHERE id = $1 RETURNING *`,
    [proposalId],
  );
  return updated.rows[0]!;
}

export async function acceptProposal(proposalId: string, clientId: string) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ProposalRow>(
      `SELECT * FROM proposals WHERE id = $1 FOR UPDATE`,
      [proposalId],
    );
    const proposal = result.rows[0];
    if (!proposal) throw new AppError(404, "Proposal not found");

    const jobRes = await client.query(`SELECT * FROM jobs WHERE id = $1`, [
      proposal.job_id,
    ]);
    const job = jobRes.rows[0] as {
      id: string;
      client_id: string;
      status: string;
    };
    if (!job) throw new AppError(404, "Job not found");
    if (job.client_id !== clientId) {
      throw new AppError(403, "Only the job client can accept");
    }
    if (proposal.status !== "pending") {
      throw new AppError(400, "Proposal is not pending");
    }

    await client.query(
      `UPDATE proposals SET status = 'accepted' WHERE id = $1`,
      [proposalId],
    );
    await client.query(
      `UPDATE proposals SET status = 'rejected' WHERE job_id = $1 AND id <> $2 AND status = 'pending'`,
      [proposal.job_id, proposalId],
    );
    await client.query(
      `UPDATE jobs SET status = 'in_progress' WHERE id = $1`,
      [proposal.job_id],
    );

    // Import dynamically to avoid circular issues — use assert at accept time
    if (job.client_id === proposal.freelancer_id) {
      throw new AppError(
        403,
        "Cannot be both client and freelancer on the same contract",
        "SELF_CONTRACT",
      );
    }

    const contractRes = await client.query<ContractRow>(
      `
      INSERT INTO contracts (
        job_id, proposal_id, client_id, freelancer_id, total_amount, status, start_date
      ) VALUES ($1, $2, $3, $4, $5, 'active', now())
      RETURNING *
      `,
      [
        proposal.job_id,
        proposal.id,
        job.client_id,
        proposal.freelancer_id,
        proposal.bid_amount,
      ],
    );
    const contract = contractRes.rows[0]!;
    await client.query("COMMIT");

    const customJsonPayload = {
      id: APP_ID,
      json: JSON.stringify({
        app_id: APP_ID,
        type: "contract_created",
        contract_id: contract.id,
        job_id: contract.job_id,
        proposal_id: contract.proposal_id,
        client_id: contract.client_id,
        freelancer_id: contract.freelancer_id,
        total_amount: contract.total_amount,
      }),
      required_auths: [],
      required_posting_auths: [], // filled by client username on broadcast
    };

    return { contract, custom_json: customJsonPayload };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmAccept(
  proposalId: string,
  clientId: string,
  hiveTxId: string,
) {
  const pool = getPool();
  const proposal = await pool.query<ProposalRow>(
    `SELECT * FROM proposals WHERE id = $1`,
    [proposalId],
  );
  if (!proposal.rows[0]) throw new AppError(404, "Proposal not found");

  const contract = await pool.query<ContractRow>(
    `SELECT * FROM contracts WHERE proposal_id = $1`,
    [proposalId],
  );
  const row = contract.rows[0];
  if (!row) throw new AppError(404, "Contract not found");
  if (row.client_id !== clientId) {
    throw new AppError(403, "Only the client can confirm");
  }

  await pool.query(`UPDATE proposals SET hive_tx_id = $2 WHERE id = $1`, [
    proposalId,
    hiveTxId,
  ]);
  const updated = await pool.query<ContractRow>(
    `UPDATE contracts SET hive_tx_id = $2 WHERE id = $1 RETURNING *`,
    [row.id, hiveTxId],
  );
  return updated.rows[0]!;
}
