import { getPool } from "@hive-freelance/db";

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
  const pool = getPool();
  const paymentRes = await pool.query<{
    id: string;
    milestone_id: string;
    status: string;
    agent_approve_tx_id: string | null;
    freelancer_approve_tx_id: string | null;
    freelancer_username: string;
  }>(
    `
    SELECT p.id, p.milestone_id, p.status,
           p.agent_approve_tx_id, p.freelancer_approve_tx_id,
           uf.hive_username AS freelancer_username
    FROM payments p
    JOIN contracts c ON c.id = p.contract_id
    JOIN users uf ON uf.id = c.freelancer_id
    WHERE p.escrow_id = $1
    `,
    [escrowId],
  );
  const row = paymentRes.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    milestone_id: row.milestone_id,
    status: row.status,
    agent: agentAccount(),
    freelancer: row.freelancer_username,
    agent_approve_tx_id: row.agent_approve_tx_id,
    freelancer_approve_tx_id: row.freelancer_approve_tx_id,
  };
}

/** Both agent + freelancer escrow_approve seen in hive_records at LIB. */
async function bothApprovesAtLib(escrowId: number, agent: string, freelancer: string) {
  const pool = getPool();
  const res = await pool.query<{ who: string | null }>(
    `
    SELECT DISTINCT COALESCE(payload->>'who', from_account) AS who
    FROM hive_records
    WHERE operation_type = 'escrow_approve'
      AND escrow_id = $1
      AND confirmed = true
    `,
    [escrowId],
  );
  const whos = new Set(
    res.rows.map((r) => (r.who ?? "").toLowerCase()).filter(Boolean),
  );
  return (
    whos.has(agent.toLowerCase()) && whos.has(freelancer.toLowerCase())
  );
}

async function markEscrowed(paymentId: string, milestoneId: string) {
  const pool = getPool();
  await pool.query(`UPDATE payments SET status = 'escrowed' WHERE id = $1`, [
    paymentId,
  ]);
  await pool.query(
    `
    UPDATE milestones SET status = 'funded'
    WHERE id = $1 AND status IN ('pending', 'funded')
    `,
    [milestoneId],
  );
}

/**
 * Close missed-ratification escrows so the milestone can be re-funded.
 * Protocol auto-refunds to client; we mark payment refunded + milestone pending.
 */
export async function resetMissedRatifications(): Promise<number> {
  const pool = getPool();
  const due = await pool.query<{
    id: string;
    milestone_id: string;
  }>(
    `
    SELECT id, milestone_id FROM payments
    WHERE status = 'awaiting_ratification'
      AND ratification_deadline IS NOT NULL
      AND ratification_deadline < now()
      AND (
        agent_approve_tx_id IS NULL
        OR freelancer_approve_tx_id IS NULL
      )
    `,
  );

  for (const row of due.rows) {
    await pool.query(
      `
      UPDATE payments
      SET status = 'refunded',
          hive_tx_id = NULL,
          agent_approve_tx_id = NULL,
          freelancer_approve_tx_id = NULL
      WHERE id = $1
      `,
      [row.id],
    );
    await pool.query(
      `UPDATE milestones SET status = 'pending' WHERE id = $1 AND status = 'funded'`,
      [row.milestone_id],
    );
    console.info(
      `[paymentSync] missed ratification → refunded payment=${row.id} (re-fundable)`,
    );
  }
  return due.rows.length;
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

  // Ignore unrelated chain escrows unless they match our agent / app meta.
  if (
    op.operation_type.startsWith("escrow_") &&
    !isOurEscrowPayload(op.payload)
  ) {
    // Still allow match by known escrow_id in our payments table below —
    // but skip if payload has a different agent.
    const agent = op.payload.agent;
    if (typeof agent === "string" && agent !== agentAccount()) {
      return;
    }
  }

  const payment = await loadPaymentParties(op.escrow_id);
  if (!payment) return;

  if (op.operation_type === "escrow_transfer") {
    if (payment.status === "pending") {
      await getPool().query(
        `UPDATE payments SET status = 'awaiting_ratification' WHERE id = $1`,
        [payment.id],
      );
    }
    return;
  }

  if (op.operation_type === "escrow_approve") {
    const who = String(
      (op.payload.who as string | undefined) ?? op.from_account ?? "",
    ).toLowerCase();

    if (who === payment.agent.toLowerCase()) {
      await getPool().query(
        `
        UPDATE payments
        SET agent_approve_tx_id = COALESCE(agent_approve_tx_id, $2)
        WHERE id = $1
        `,
        [payment.id, `chain:${op.escrow_id}:agent`],
      );
    }
    if (who === payment.freelancer.toLowerCase()) {
      await getPool().query(
        `
        UPDATE payments
        SET freelancer_approve_tx_id = COALESCE(freelancer_approve_tx_id, $2)
        WHERE id = $1
        `,
        [payment.id, `chain:${op.escrow_id}:freelancer`],
      );
    }

    const both = await bothApprovesAtLib(
      op.escrow_id,
      payment.agent,
      payment.freelancer,
    );
    if (
      both &&
      (payment.status === "awaiting_ratification" || payment.status === "pending")
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

    // Missed ratification / protocol refund to client before escrowed.
    const isRefundToClient =
      receiver != null && from != null && receiver === from;
    const isCooperativeRefund =
      isRefundToClient &&
      to != null &&
      payment.status === "escrowed";

    if (
      isRefundToClient &&
      (payment.status === "awaiting_ratification" || payment.status === "pending")
    ) {
      await getPool().query(
        `
        UPDATE payments
        SET status = 'refunded',
            hive_tx_id = NULL,
            agent_approve_tx_id = NULL,
            freelancer_approve_tx_id = NULL
        WHERE id = $1
        `,
        [payment.id],
      );
      await getPool().query(
        `UPDATE milestones SET status = 'pending' WHERE id = $1`,
        [payment.milestone_id],
      );
      console.info(
        `[paymentSync] pre-escrow refund → re-fundable payment=${payment.id}`,
      );
      return;
    }

    if (isCooperativeRefund || isRefundToClient) {
      await getPool().query(
        `UPDATE payments SET status = 'refunded' WHERE id = $1`,
        [payment.id],
      );
      await getPool().query(
        `UPDATE milestones SET status = 'pending' WHERE id = $1`,
        [payment.milestone_id],
      );
      return;
    }

    await getPool().query(
      `UPDATE payments SET status = 'released' WHERE id = $1`,
      [payment.id],
    );
    await getPool().query(
      `UPDATE milestones SET status = 'released' WHERE id = $1`,
      [payment.milestone_id],
    );
  }
}
