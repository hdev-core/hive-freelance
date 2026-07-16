import {
  getPool,
  type ContractRow,
  type MilestoneRow,
  type PaymentCurrency,
  type PaymentRow,
} from "@hive-freelance/db";
import { agentKeyRef, createKmsSigner } from "@hive-freelance/hive";
import { AppError } from "../lib/errors.js";
import { getUserById } from "./users.js";

function agentAccount(): string {
  return process.env.AGENT_ACCOUNT ?? "hive-freelance-agent";
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

async function nextEscrowId(): Promise<number> {
  const result = await getPool().query<{ max: number | null }>(
    `SELECT COALESCE(MAX(escrow_id), 0)::int AS max FROM payments`,
  );
  return (result.rows[0]?.max ?? 0) + 1;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD for Hive
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

  const existing = await pool.query(
    `SELECT 1 FROM payments WHERE milestone_id = $1 LIMIT 1`,
    [milestoneId],
  );
  if ((existing.rowCount ?? 0) > 0) {
    throw new AppError(409, "Payment already exists for this milestone");
  }

  const clientUser = await getUserById(clientId);
  const freelancerUser = await getUserById(contract.freelancer_id);
  if (!clientUser || !freelancerUser) {
    throw new AppError(500, "Contract parties missing");
  }

  const escrowId = await nextEscrowId();
  const amount = Number(milestone.amount).toFixed(3);
  const amountStr = `${amount} ${currency}`;

  const paymentRes = await pool.query<PaymentRow>(
    `
    INSERT INTO payments (contract_id, milestone_id, amount, currency, status, escrow_id)
    VALUES ($1, $2, $3, $4, 'pending', $5)
    RETURNING *
    `,
    [contractId, milestoneId, milestone.amount, currency, escrowId],
  );
  const payment = paymentRes.rows[0]!;

  const ratificationDeadline = daysFromNow(2);
  const escrowExpiration = daysFromNow(30);

  const escrow_transfer = {
    from: clientUser.hive_username,
    to: freelancerUser.hive_username,
    agent: agentAccount(),
    escrow_id: escrowId,
    hbd_amount: currency === "HBD" ? amountStr : "0.000 HBD",
    hive_amount: currency === "HIVE" ? amountStr : "0.000 HIVE",
    fee: "0.000 HBD",
    ratification_deadline: ratificationDeadline,
    escrow_expiration: escrowExpiration,
    json_meta: JSON.stringify({
      app_id: process.env.APP_ID ?? "hive-freelance-v1",
      payment_id: payment.id,
      milestone_id: milestoneId,
      contract_id: contractId,
    }),
  };

  return { payment, escrow_transfer };
}

export async function confirmFund(paymentId: string, clientId: string, hiveTxId: string) {
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
    [paymentId, hiveTxId],
  );

  // Agent auto-approve hook (dry-run via KMS stub until escrow doc hardening)
  try {
    const kms = createKmsSigner();
    const keyRef = agentKeyRef();
    const has = await kms.hasKey(keyRef).catch(() => false);
    if (has) {
      await kms.signWithKms(agentAccount(), keyRef, [
        {
          escrow_approve: {
            from: "client",
            to: "freelancer",
            agent: agentAccount(),
            who: agentAccount(),
            escrow_id: payment.escrow_id,
            approve: true,
          },
        },
      ]);
      console.info(
        `[payments] agent escrow_approve dry-run for payment ${paymentId}`,
      );
    } else {
      console.info(
        `[payments] agent key not configured — skip escrow_approve stub for ${paymentId}`,
      );
    }
  } catch (err) {
    console.warn("[payments] agent approve stub failed:", err);
  }

  return updated.rows[0]!;
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
  };
}

export async function confirmRatify(
  paymentId: string,
  freelancerId: string,
  hiveTxId: string,
) {
  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.freelancer_id !== freelancerId) {
    throw new AppError(403, "Only the freelancer can confirm ratify");
  }

  // Off-chain mark: listener will set escrowed at LIB when both approves seen.
  // For API UX we also bump milestone to funded when ratify confirmed.
  const pool = getPool();
  await pool.query(
    `
    UPDATE milestones SET status = 'funded'
    WHERE id = $1 AND status = 'pending'
    `,
    [payment.milestone_id],
  );

  // Store freelancer approve tx in json_meta-style via hive_records later;
  // keep payment awaiting_ratification until listener confirms both sides / LIB.
  console.info(
    `[payments] freelancer ratify confirmed payment=${paymentId} tx=${hiveTxId}`,
  );
  return payment;
}

export async function releasePayload(paymentId: string, clientId: string) {
  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can release");
  }
  if (!["escrowed", "awaiting_ratification"].includes(payment.status)) {
    // Allow release attempt after escrowed; awaiting only if already funded path
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
  };
}

export async function confirmRelease(
  paymentId: string,
  clientId: string,
  hiveTxId: string,
) {
  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can confirm release");
  }

  const pool = getPool();
  const updated = await pool.query<PaymentRow>(
    `
    UPDATE payments SET status = 'released', hive_tx_id = COALESCE($2, hive_tx_id)
    WHERE id = $1
    RETURNING *
    `,
    [paymentId, hiveTxId],
  );
  await pool.query(
    `UPDATE milestones SET status = 'released' WHERE id = $1`,
    [payment.milestone_id],
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
  };
}

export async function confirmRefund(
  paymentId: string,
  freelancerId: string,
  hiveTxId: string,
) {
  const payment = await loadPayment(paymentId);
  const contract = await loadContract(payment.contract_id);
  if (contract.freelancer_id !== freelancerId) {
    throw new AppError(403, "Only the freelancer can confirm refund");
  }

  const updated = await getPool().query<PaymentRow>(
    `
    UPDATE payments SET status = 'refunded', hive_tx_id = COALESCE($2, hive_tx_id)
    WHERE id = $1
    RETURNING *
    `,
    [paymentId, hiveTxId],
  );
  await getPool().query(
    `UPDATE milestones SET status = 'pending' WHERE id = $1`,
    [payment.milestone_id],
  );
  return updated.rows[0]!;
}
