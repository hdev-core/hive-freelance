import {
  getPool,
  type ContractRow,
  type MilestoneRow,
  type PaymentCurrency,
  type PaymentRow,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { agentAutoApprove, computeEscrowId } from "./agentEscrow.js";
import { getUserById } from "./users.js";

function agentAccount(): string {
  return process.env.AGENT_ACCOUNT ?? "hive-freelance-agent";
}

function appId(): string {
  return process.env.APP_ID ?? "hive-freelance-v1";
}

/** Trust client confirm for terminal release/refund (demo only). Default: listener owns LIB. */
function trustClientConfirm(): boolean {
  return process.env.ESCROW_TRUST_CLIENT_CONFIRM === "true";
}

async function loadContract(contractId: string): Promise<ContractRow> {
  const result = await getPool().query<ContractRow>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );
  if (!result.rows[0]) throw new AppError(404, "Contract not found");
  return result.rows[0];
}

async function loadPayment(paymentId: string): Promise<PaymentRow> {
  const result = await getPool().query<PaymentRow>(
    `SELECT * FROM payments WHERE id = $1`,
    [paymentId],
  );
  if (!result.rows[0]) throw new AppError(404, "Payment not found");
  return result.rows[0];
}

/** Hive datetime: YYYY-MM-DDTHH:mm:ss */
function toHiveDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function signingMode(user: {
  auth_type: string;
  kms_key_ref: string | null;
}): "custodial" | "keychain" {
  return user.auth_type === "google" && user.kms_key_ref
    ? "custodial"
    : "keychain";
}

export async function listPayments(contractId: string, userId: string) {
  const contract = await loadContract(contractId);
  if (contract.client_id !== userId && contract.freelancer_id !== userId) {
    throw new AppError(403, "Not a party to this contract");
  }
  const result = await getPool().query<PaymentRow>(
    `SELECT * FROM payments WHERE contract_id = $1 ORDER BY created_at ASC`,
    [contractId],
  );
  return result.rows;
}

export async function getContractBundle(contractId: string, userId: string) {
  const contract = await loadContract(contractId);
  if (contract.client_id !== userId && contract.freelancer_id !== userId) {
    throw new AppError(403, "Not a party to this contract");
  }
  const pool = getPool();
  const milestones = await pool.query<MilestoneRow>(
    `SELECT * FROM milestones WHERE contract_id = $1 ORDER BY milestone_order ASC`,
    [contractId],
  );
  const payments = await pool.query<PaymentRow>(
    `SELECT * FROM payments WHERE contract_id = $1 ORDER BY created_at ASC`,
    [contractId],
  );
  const client = await getUserById(contract.client_id);
  const freelancer = await getUserById(contract.freelancer_id);
  return {
    contract,
    milestones: milestones.rows,
    payments: payments.rows,
    parties: {
      client: client
        ? { id: client.id, hive_username: client.hive_username }
        : null,
      freelancer: freelancer
        ? { id: freelancer.id, hive_username: freelancer.hive_username }
        : null,
    },
  };
}

export async function fundMilestone(
  contractId: string,
  milestoneId: string,
  clientId: string,
  currency: PaymentCurrency = "HBD",
) {
  const pool = getPool();
  const contract = await loadContract(contractId);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can fund milestones");
  }

  const milestoneRes = await pool.query<MilestoneRow>(
    `SELECT * FROM milestones WHERE id = $1 AND contract_id = $2`,
    [milestoneId, contractId],
  );
  const milestone = milestoneRes.rows[0];
  if (!milestone) throw new AppError(404, "Milestone not found");
  if (milestone.status !== "pending") {
    throw new AppError(400, "Milestone is not pending funding");
  }

  // Allow re-fund only when prior payment was reset (missed ratification / refunded pending).
  const blocking = await pool.query(
    `
    SELECT 1 FROM payments
    WHERE milestone_id = $1
      AND status NOT IN ('pending', 'refunded')
    LIMIT 1
    `,
    [milestoneId],
  );
  if ((blocking.rowCount ?? 0) > 0) {
    throw new AppError(409, "Active payment already exists for this milestone");
  }

  // Close stale pending rows from missed ratification so a fresh fund can proceed.
  await pool.query(
    `
    UPDATE payments
    SET status = 'refunded'
    WHERE milestone_id = $1 AND status = 'pending' AND hive_tx_id IS NOT NULL
    `,
    [milestoneId],
  );

  const stillPending = await pool.query(
    `SELECT 1 FROM payments WHERE milestone_id = $1 AND status = 'pending' LIMIT 1`,
    [milestoneId],
  );
  if ((stillPending.rowCount ?? 0) > 0) {
    throw new AppError(409, "Payment already exists for this milestone");
  }

  const clientUser = await getUserById(clientId);
  const freelancerUser = await getUserById(contract.freelancer_id);
  if (!clientUser || !freelancerUser) {
    throw new AppError(500, "Contract parties missing");
  }

  const ratificationDeadline = hoursFromNow(24);
  const endBase = contract.end_date
    ? new Date(contract.end_date)
    : new Date();
  const escrowExpiration = addDays(endBase, 30);

  // Insert first to get payment id, then compute escrow_id and update.
  const paymentRes = await pool.query<PaymentRow>(
    `
    INSERT INTO payments (
      contract_id, milestone_id, amount, currency, status,
      ratification_deadline, escrow_expiration
    )
    VALUES ($1, $2, $3, $4, 'pending', $5, $6)
    RETURNING *
    `,
    [
      contractId,
      milestoneId,
      milestone.amount,
      currency,
      ratificationDeadline,
      escrowExpiration,
    ],
  );
  const payment = paymentRes.rows[0]!;

  const escrowId = await computeEscrowId(
    payment.id,
    clientUser.hive_username,
    freelancerUser.hive_username,
  );
  await pool.query(`UPDATE payments SET escrow_id = $2 WHERE id = $1`, [
    payment.id,
    escrowId,
  ]);
  payment.escrow_id = escrowId;

  const amount = Number(milestone.amount).toFixed(3);
  const amountStr = `${amount} ${currency}`;

  const escrow_transfer = {
    from: clientUser.hive_username,
    to: freelancerUser.hive_username,
    agent: agentAccount(),
    escrow_id: escrowId,
    hbd_amount: currency === "HBD" ? amountStr : "0.000 HBD",
    hive_amount: currency === "HIVE" ? amountStr : "0.000 HIVE",
    fee: "0.000 HBD",
    ratification_deadline: toHiveDateTime(ratificationDeadline),
    escrow_expiration: toHiveDateTime(escrowExpiration),
    json_meta: JSON.stringify({
      app: appId(),
      contract_id: contractId,
      milestone_id: milestoneId,
      payment_id: payment.id,
    }),
  };

  return {
    payment,
    escrow_transfer,
    mode: signingMode(clientUser),
  };
}

export async function confirmFund(
  paymentId: string,
  clientId: string,
  hiveTxId: string,
) {
  if (!hiveTxId?.trim()) {
    throw new AppError(400, "hive_tx_id is required");
  }

  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can confirm funding");
  }
  if (payment.status !== "pending") {
    throw new AppError(400, `Payment status is ${payment.status}`);
  }

  const updated = await getPool().query<PaymentRow>(
    `
    UPDATE payments
    SET status = 'awaiting_ratification', hive_tx_id = $2
    WHERE id = $1
    RETURNING *
    `,
    [paymentId, hiveTxId.trim()],
  );
  const row = updated.rows[0]!;

  const clientUser = await getUserById(contract.client_id);
  const freelancerUser = await getUserById(contract.freelancer_id);
  if (clientUser && freelancerUser && row.escrow_id != null) {
    try {
      await agentAutoApprove({
        paymentId: row.id,
        escrowId: row.escrow_id,
        from: clientUser.hive_username,
        to: freelancerUser.hive_username,
      });
    } catch (err) {
      console.warn("[payments] agent auto-approve failed:", err);
    }
  }

  return loadPayment(paymentId);
}

export async function ratifyPayload(paymentId: string, freelancerId: string) {
  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.freelancer_id !== freelancerId) {
    throw new AppError(403, "Only the freelancer can ratify");
  }
  if (payment.status !== "awaiting_ratification") {
    throw new AppError(400, `Payment status is ${payment.status}`);
  }

  const clientUser = await getUserById(contract.client_id);
  const freelancerUser = await getUserById(contract.freelancer_id);

  return {
    payment,
    escrow_approve: {
      from: clientUser!.hive_username,
      to: freelancerUser!.hive_username,
      agent: agentAccount(),
      who: freelancerUser!.hive_username,
      escrow_id: payment.escrow_id,
      approve: true,
    },
    mode: signingMode(freelancerUser!),
  };
}

export async function confirmRatify(
  paymentId: string,
  freelancerId: string,
  hiveTxId: string,
) {
  if (!hiveTxId?.trim()) {
    throw new AppError(400, "hive_tx_id is required");
  }

  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.freelancer_id !== freelancerId) {
    throw new AppError(403, "Only the freelancer can confirm ratify");
  }
  if (payment.status !== "awaiting_ratification") {
    throw new AppError(400, `Payment status is ${payment.status}`);
  }

  const updated = await getPool().query<PaymentRow>(
    `
    UPDATE payments
    SET freelancer_approve_tx_id = $2
    WHERE id = $1
    RETURNING *
    `,
    [paymentId, hiveTxId.trim()],
  );
  const row = updated.rows[0]!;

  // Local dry demo: both approve tx refs exist without chain LIB — promote escrowed.
  if (
    process.env.ESCROW_DRY_DEMO === "true" &&
    row.agent_approve_tx_id &&
    row.freelancer_approve_tx_id
  ) {
    await getPool().query(
      `UPDATE payments SET status = 'escrowed' WHERE id = $1`,
      [paymentId],
    );
    await getPool().query(
      `
      UPDATE milestones SET status = 'funded'
      WHERE id = $1 AND status IN ('pending', 'funded')
      `,
      [payment.milestone_id],
    );
    console.info(
      `[payments] ESCROW_DRY_DEMO both approves → escrowed payment=${paymentId}`,
    );
    return loadPayment(paymentId);
  }

  // Do not set escrowed here — listener requires both approves at LIB.
  console.info(
    `[payments] freelancer ratify confirmed payment=${paymentId} tx=${hiveTxId}`,
  );
  return row;
}

export async function releasePayload(paymentId: string, clientId: string) {
  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can release");
  }
  if (payment.status !== "escrowed") {
    throw new AppError(400, `Payment must be escrowed (is ${payment.status})`);
  }

  const clientUser = await getUserById(contract.client_id);
  const freelancerUser = await getUserById(contract.freelancer_id);
  const amount = Number(payment.amount).toFixed(3);
  const amountStr = `${amount} ${payment.currency}`;

  return {
    payment,
    escrow_release: {
      from: clientUser!.hive_username,
      to: freelancerUser!.hive_username,
      agent: agentAccount(),
      who: clientUser!.hive_username,
      receiver: freelancerUser!.hive_username,
      escrow_id: payment.escrow_id,
      hbd_amount: payment.currency === "HBD" ? amountStr : "0.000 HBD",
      hive_amount: payment.currency === "HIVE" ? amountStr : "0.000 HIVE",
    },
    mode: signingMode(clientUser!),
  };
}

export async function confirmRelease(
  paymentId: string,
  clientId: string,
  hiveTxId: string,
) {
  if (!hiveTxId?.trim()) {
    throw new AppError(400, "hive_tx_id is required");
  }

  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can confirm release");
  }
  if (payment.status !== "escrowed") {
    throw new AppError(400, `Payment must be escrowed (is ${payment.status})`);
  }

  const pool = getPool();
  if (trustClientConfirm()) {
    const updated = await pool.query<PaymentRow>(
      `
      UPDATE payments
      SET status = 'released',
          release_tx_id = $2,
          hive_tx_id = COALESCE($2, hive_tx_id)
      WHERE id = $1
      RETURNING *
      `,
      [paymentId, hiveTxId.trim()],
    );
    await pool.query(
      `UPDATE milestones SET status = 'released' WHERE id = $1`,
      [payment.milestone_id],
    );
    return updated.rows[0]!;
  }

  const updated = await pool.query<PaymentRow>(
    `
    UPDATE payments
    SET release_tx_id = $2
    WHERE id = $1
    RETURNING *
    `,
    [paymentId, hiveTxId.trim()],
  );
  console.info(
    `[payments] release tx recorded; awaiting LIB listener for payment=${paymentId}`,
  );
  return updated.rows[0]!;
}

export async function refundPayload(paymentId: string, freelancerId: string) {
  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.freelancer_id !== freelancerId) {
    throw new AppError(403, "Only the freelancer can initiate cooperative refund");
  }
  if (payment.status !== "escrowed") {
    throw new AppError(400, `Payment must be escrowed (is ${payment.status})`);
  }

  const clientUser = await getUserById(contract.client_id);
  const freelancerUser = await getUserById(contract.freelancer_id);
  const amount = Number(payment.amount).toFixed(3);
  const amountStr = `${amount} ${payment.currency}`;

  return {
    payment,
    escrow_release: {
      from: clientUser!.hive_username,
      to: freelancerUser!.hive_username,
      agent: agentAccount(),
      who: freelancerUser!.hive_username,
      receiver: clientUser!.hive_username,
      escrow_id: payment.escrow_id,
      hbd_amount: payment.currency === "HBD" ? amountStr : "0.000 HBD",
      hive_amount: payment.currency === "HIVE" ? amountStr : "0.000 HIVE",
    },
    mode: signingMode(freelancerUser!),
  };
}

export async function confirmRefund(
  paymentId: string,
  freelancerId: string,
  hiveTxId: string,
) {
  if (!hiveTxId?.trim()) {
    throw new AppError(400, "hive_tx_id is required");
  }

  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.freelancer_id !== freelancerId) {
    throw new AppError(403, "Only the freelancer can confirm refund");
  }
  if (payment.status !== "escrowed") {
    throw new AppError(400, `Payment must be escrowed (is ${payment.status})`);
  }

  const pool = getPool();
  if (trustClientConfirm()) {
    const updated = await pool.query<PaymentRow>(
      `
      UPDATE payments
      SET status = 'refunded',
          release_tx_id = $2,
          hive_tx_id = COALESCE($2, hive_tx_id)
      WHERE id = $1
      RETURNING *
      `,
      [paymentId, hiveTxId.trim()],
    );
    await pool.query(
      `UPDATE milestones SET status = 'pending' WHERE id = $1`,
      [payment.milestone_id],
    );
    return updated.rows[0]!;
  }

  const updated = await pool.query<PaymentRow>(
    `
    UPDATE payments
    SET release_tx_id = $2
    WHERE id = $1
    RETURNING *
    `,
    [paymentId, hiveTxId.trim()],
  );
  console.info(
    `[payments] refund tx recorded; awaiting LIB listener for payment=${paymentId}`,
  );
  return updated.rows[0]!;
}

/**
 * Custodial Google users: server-side sign stub via KMS.
 * Dry-run unless CUSTODIAL_LIVE=true. Returns a synthetic hive_tx_id in dry-run.
 */
export async function executeCustodialSign(
  userId: string,
  opName: string,
  ops: Record<string, unknown>[],
): Promise<{ dryRun: boolean; hive_tx_id: string; message: string }> {
  const user = await getUserById(userId);
  if (!user) throw new AppError(404, "User not found");
  if (user.auth_type !== "google" || !user.kms_key_ref) {
    throw new AppError(400, "User is not a custodial Google account");
  }

  const live = process.env.CUSTODIAL_LIVE === "true";
  const { createKmsSigner } = await import("@hive-freelance/hive");
  const kms = createKmsSigner();
  try {
    await kms.signWithKms(user.hive_username, user.kms_key_ref, ops);
  } catch (err) {
    if (live) throw err;
    console.warn("[payments] custodial sign stub (no vault key material):", err);
  }

  const hive_tx_id = live
    ? `pending-broadcast-${opName}`
    : `dry-run-${opName}-${Date.now()}`;

  return {
    dryRun: !live,
    hive_tx_id,
    message: live
      ? "Custodial broadcast path invoked (wire full WAX broadcast in production)"
      : "Dry-run custodial sign — set CUSTODIAL_LIVE=true for live path",
  };
}
