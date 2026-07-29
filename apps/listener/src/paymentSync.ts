import { prisma } from "@hive-freelance/db";

function agentAccount(): string {
  return process.env.AGENT_ACCOUNT ?? "hive-freelance-agent";
}

function appId(): string {
  return process.env.APP_ID ?? "hive-freelance-v1";
}

function isOurEscrowPayload(payload: Record<string, unknown>): boolean {
  const agent = payload.agent;
  if (typeof agent === "string" && agent === agentAccount()) return true;

  const metaRaw = payload.json_meta;
  if (typeof metaRaw === "string") {
    try {
      const meta = JSON.parse(metaRaw) as { app?: string; app_id?: string };
      if (meta.app === appId() || meta.app_id === appId()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function loadPaymentParties(escrowId: number): Promise<{
  id: string;
  milestone_id: string;
  status: string;
  agent: string;
  freelancer: string;
  agent_approve_tx_id: string | null;
  freelancer_approve_tx_id: string | null;
} | null> {
  const payment = await prisma.payment.findFirst({
    where: { escrowId },
    include: { contract: { include: { freelancer: true } } },
  });
  if (!payment) return null;
  return {
    id: payment.id.toString(),
    milestone_id: payment.milestoneId.toString(),
    status: payment.status,
    agent: agentAccount(),
    freelancer: payment.contract.freelancer.hiveUsername,
    agent_approve_tx_id: payment.agentApproveTxId,
    freelancer_approve_tx_id: payment.freelancerApproveTxId,
  };
}

/** Both agent + freelancer escrow_approve seen in hive_records at LIB. */
async function bothApprovesAtLib(
  escrowId: number,
  agent: string,
  freelancer: string,
) {
  // JSONB path extraction (payload->>'who') + COALESCE + DISTINCT has no
  // clean typed Prisma equivalent — kept as raw SQL, same as the row-lock
  // pattern in proposals.ts.
  const rows = await prisma.$queryRaw<{ who: string | null }[]>`
    SELECT DISTINCT COALESCE(payload->>'who', from_account) AS who
    FROM hive_records
    WHERE operation_type = 'escrow_approve'
      AND escrow_id = ${escrowId}
      AND confirmed = true
  `;
  const whos = new Set(
    rows.map((r) => (r.who ?? "").toLowerCase()).filter(Boolean),
  );
  return whos.has(agent.toLowerCase()) && whos.has(freelancer.toLowerCase());
}

async function markEscrowed(paymentId: string, milestoneId: string) {
  await prisma.payment.update({
    where: { id: BigInt(paymentId) },
    data: { status: "escrowed" },
  });
  await prisma.milestone.updateMany({
    where: { id: BigInt(milestoneId), status: { in: ["pending", "funded"] } },
    data: { status: "funded" },
  });
}

/**
 * Close missed-ratification escrows so the milestone can be re-funded.
 * Protocol auto-refunds to client; we mark payment refunded + milestone pending.
 */
export async function resetMissedRatifications(): Promise<number> {
  const due = await prisma.payment.findMany({
    where: {
      status: "awaiting_ratification",
      ratificationDeadline: { not: null, lt: new Date() },
      OR: [{ agentApproveTxId: null }, { freelancerApproveTxId: null }],
    },
    select: { id: true, milestoneId: true },
  });

  for (const row of due) {
    await prisma.payment.update({
      where: { id: row.id },
      data: {
        status: "refunded",
        hiveTxId: null,
        agentApproveTxId: null,
        freelancerApproveTxId: null,
      },
    });
    await prisma.milestone.updateMany({
      where: { id: row.milestoneId, status: "funded" },
      data: { status: "pending" },
    });
    console.info(
      `[paymentSync] missed ratification → refunded payment=${row.id} (re-fundable)`,
    );
  }
  return due.length;
}

/**
 * Apply LIB-confirmed escrow ops to payments / milestones.
 * Never call for head-only (non-LIB) blocks.
 */
export async function syncPaymentFromEscrowOp(op: {
  operation_type: string;
  escrow_id: number | null;
  from_account: string | null;
  to_account: string | null;
  payload: Record<string, unknown>;
  confirmed: boolean;
}): Promise<void> {
  if (!op.confirmed || op.escrow_id == null) return;

  if (
    op.operation_type.startsWith("escrow_") &&
    !isOurEscrowPayload(op.payload)
  ) {
    const agent = op.payload.agent;
    if (typeof agent === "string" && agent !== agentAccount()) {
      return;
    }
  }

  const payment = await loadPaymentParties(op.escrow_id);
  if (!payment) return;

  if (op.operation_type === "escrow_transfer") {
    if (payment.status === "pending") {
      await prisma.payment.update({
        where: { id: BigInt(payment.id) },
        data: { status: "awaiting_ratification" },
      });
    }
    return;
  }

  if (op.operation_type === "escrow_approve") {
    const who = String(
      (op.payload.who as string | undefined) ?? op.from_account ?? "",
    ).toLowerCase();

    // COALESCE(agent_approve_tx_id, $2) equivalent: only write if currently
    // null — updateMany with a where-filter on the current value is a
    // no-op when it's already set, same effect as COALESCE.
    if (who === payment.agent.toLowerCase()) {
      await prisma.payment.updateMany({
        where: { id: BigInt(payment.id), agentApproveTxId: null },
        data: { agentApproveTxId: `chain:${op.escrow_id}:agent` },
      });
    }
    if (who === payment.freelancer.toLowerCase()) {
      await prisma.payment.updateMany({
        where: { id: BigInt(payment.id), freelancerApproveTxId: null },
        data: { freelancerApproveTxId: `chain:${op.escrow_id}:freelancer` },
      });
    }

    const both = await bothApprovesAtLib(
      op.escrow_id,
      payment.agent,
      payment.freelancer,
    );
    if (
      both &&
      (payment.status === "awaiting_ratification" ||
        payment.status === "pending")
    ) {
      await markEscrowed(payment.id, payment.milestone_id);
      console.info(
        `[paymentSync] both approves at LIB → escrowed payment=${payment.id}`,
      );
    }
    return;
  }

  if (op.operation_type === "escrow_release") {
    const receiver =
      (op.payload.receiver as string | undefined) ?? op.to_account;
    const from = (op.payload.from as string | undefined) ?? op.from_account;
    const to = (op.payload.to as string | undefined) ?? null;

    const isRefundToClient =
      receiver != null && from != null && receiver === from;
    const isCooperativeRefund =
      isRefundToClient && to != null && payment.status === "escrowed";

    if (
      isRefundToClient &&
      (payment.status === "awaiting_ratification" ||
        payment.status === "pending")
    ) {
      await prisma.payment.update({
        where: { id: BigInt(payment.id) },
        data: {
          status: "refunded",
          hiveTxId: null,
          agentApproveTxId: null,
          freelancerApproveTxId: null,
        },
      });
      await prisma.milestone.update({
        where: { id: BigInt(payment.milestone_id) },
        data: { status: "pending" },
      });
      console.info(
        `[paymentSync] pre-escrow refund → re-fundable payment=${payment.id}`,
      );
      return;
    }

    if (isCooperativeRefund || isRefundToClient) {
      await prisma.payment.update({
        where: { id: BigInt(payment.id) },
        data: { status: "refunded" },
      });
      await prisma.milestone.update({
        where: { id: BigInt(payment.milestone_id) },
        data: { status: "pending" },
      });
      return;
    }

    await prisma.payment.update({
      where: { id: BigInt(payment.id) },
      data: { status: "released" },
    });
    await prisma.milestone.update({
      where: { id: BigInt(payment.milestone_id) },
      data: { status: "released" },
    });
  }
}