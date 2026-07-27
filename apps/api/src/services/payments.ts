import {
  prisma,
  toContractRow,
  toMilestoneRow,
  toPaymentRow,
  type PaymentCurrency,
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

async function loadContract(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: BigInt(contractId) },
  });
  if (!contract) throw new AppError(404, "Contract not found");
  return toContractRow(contract);
}

async function loadPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: BigInt(paymentId) },
  });
  if (!payment) throw new AppError(404, "Payment not found");
  return toPaymentRow(payment);
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
  const payments = await prisma.payment.findMany({
    where: { contractId: BigInt(contractId) },
    orderBy: { createdAt: "asc" },
  });
  return payments.map(toPaymentRow);
}

export async function getContractBundle(contractId: string, userId: string) {
  const contract = await loadContract(contractId);
  if (contract.client_id !== userId && contract.freelancer_id !== userId) {
    throw new AppError(403, "Not a party to this contract");
  }
  const [milestones, payments, client, freelancer] = await Promise.all([
    prisma.milestone.findMany({
      where: { contractId: BigInt(contractId) },
      orderBy: { milestoneOrder: "asc" },
    }),
    prisma.payment.findMany({
      where: { contractId: BigInt(contractId) },
      orderBy: { createdAt: "asc" },
    }),
    getUserById(contract.client_id),
    getUserById(contract.freelancer_id),
  ]);
  return {
    contract,
    milestones: milestones.map(toMilestoneRow),
    payments: payments.map(toPaymentRow),
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
  const contract = await loadContract(contractId);
  if (contract.client_id !== clientId) {
    throw new AppError(403, "Only the client can fund milestones");
  }

  const milestoneRow = await prisma.milestone.findFirst({
    where: { id: BigInt(milestoneId), contractId: BigInt(contractId) },
  });
  if (!milestoneRow) throw new AppError(404, "Milestone not found");
  if (milestoneRow.status !== "pending") {
    throw new AppError(400, "Milestone is not pending funding");
  }

  // NOTE: this guard sequence (blocking check -> close stale rows -> recheck)
  // was not wrapped in a transaction in the original either — separate
  // queries against the pool, not BEGIN/COMMIT. Same non-atomic behavior
  // preserved here deliberately, not hardened, since changing concurrency
  // guarantees wasn't part of this port.

  // Allow re-fund only when prior payment was reset (missed ratification / refunded pending).
  const blocking = await prisma.payment.findFirst({
    where: {
      milestoneId: BigInt(milestoneId),
      status: { notIn: ["pending", "refunded"] },
    },
  });
  if (blocking) {
    throw new AppError(409, "Active payment already exists for this milestone");
  }

  // Close stale pending rows from missed ratification so a fresh fund can proceed.
  await prisma.payment.updateMany({
    where: {
      milestoneId: BigInt(milestoneId),
      status: "pending",
      hiveTxId: { not: null },
    },
    data: { status: "refunded" },
  });

  const stillPending = await prisma.payment.findFirst({
    where: { milestoneId: BigInt(milestoneId), status: "pending" },
  });
  if (stillPending) {
    throw new AppError(409, "Payment already exists for this milestone");
  }

  const clientUser = await getUserById(clientId);
  const freelancerUser = await getUserById(contract.freelancer_id);
  if (!clientUser || !freelancerUser) {
    throw new AppError(500, "Contract parties missing");
  }

  const ratificationDeadline = hoursFromNow(24);
  const endBase = contract.end_date ? new Date(contract.end_date) : new Date();
  const escrowExpiration = addDays(endBase, 30);

  // Insert first to get payment id, then compute escrow_id and update.
  let payment = await prisma.payment.create({
    data: {
      contractId: BigInt(contractId),
      milestoneId: BigInt(milestoneId),
      amount: milestoneRow.amount,
      currency,
      status: "pending",
      ratificationDeadline,
      escrowExpiration,
    },
  });

  const escrowId = await computeEscrowId(
    payment.id.toString(),
    clientUser.hive_username,
    freelancerUser.hive_username,
  );
  payment = await prisma.payment.update({
    where: { id: payment.id },
    data: { escrowId },
  });

  const amount = Number(milestoneRow.amount).toFixed(3);
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
      payment_id: payment.id.toString(),
    }),
  };

  return {
    payment: toPaymentRow(payment),
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

  const updated = await prisma.payment.update({
    where: { id: BigInt(paymentId) },
    data: { status: "awaiting_ratification", hiveTxId: hiveTxId.trim() },
  });
  const row = toPaymentRow(updated);

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

  const updated = await prisma.payment.update({
    where: { id: BigInt(paymentId) },
    data: { freelancerApproveTxId: hiveTxId.trim() },
  });
  const row = toPaymentRow(updated);

  // Local dry demo: both approve tx refs exist without chain LIB — promote escrowed.
  if (
    process.env.ESCROW_DRY_DEMO === "true" &&
    row.agent_approve_tx_id &&
    row.freelancer_approve_tx_id
  ) {
    await prisma.payment.update({
      where: { id: BigInt(paymentId) },
      data: { status: "escrowed" },
    });
    await prisma.milestone.updateMany({
      where: {
        id: BigInt(payment.milestone_id),
        status: { in: ["pending", "funded"] },
      },
      data: { status: "funded" },
    });
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

  const trimmedTx = hiveTxId.trim();

  if (trustClientConfirm()) {
    const updated = await prisma.payment.update({
      where: { id: BigInt(paymentId) },
      data: {
        status: "released",
        releaseTxId: trimmedTx,
        // COALESCE($2, hive_tx_id): trimmedTx is always truthy here (checked
        // above), so this always overwrites — matches original in practice.
        hiveTxId: trimmedTx,
      },
    });
    await prisma.milestone.update({
      where: { id: BigInt(payment.milestone_id) },
      data: { status: "released" },
    });
    return toPaymentRow(updated);
  }

  const updated = await prisma.payment.update({
    where: { id: BigInt(paymentId) },
    data: { releaseTxId: trimmedTx },
  });
  console.info(
    `[payments] release tx recorded; awaiting LIB listener for payment=${paymentId}`,
  );
  return toPaymentRow(updated);
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

  const trimmedTx = hiveTxId.trim();

  if (trustClientConfirm()) {
    const updated = await prisma.payment.update({
      where: { id: BigInt(paymentId) },
      data: {
        status: "refunded",
        releaseTxId: trimmedTx,
        hiveTxId: trimmedTx,
      },
    });
    await prisma.milestone.update({
      where: { id: BigInt(payment.milestone_id) },
      data: { status: "pending" },
    });
    return toPaymentRow(updated);
  }

  const updated = await prisma.payment.update({
    where: { id: BigInt(paymentId) },
    data: { releaseTxId: trimmedTx },
  });
  console.info(
    `[payments] refund tx recorded; awaiting LIB listener for payment=${paymentId}`,
  );
  return toPaymentRow(updated);
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