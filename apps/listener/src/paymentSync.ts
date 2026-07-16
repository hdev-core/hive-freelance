import { getPool } from "@hive-freelance/db";

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

  const pool = getPool();
  const paymentRes = await pool.query<{
    id: string;
    milestone_id: string;
    status: string;
    currency: string;
  }>(`SELECT id, milestone_id, status, currency FROM payments WHERE escrow_id = $1`, [
    op.escrow_id,
  ]);
  const payment = paymentRes.rows[0];
  if (!payment) return;

  if (op.operation_type === "escrow_transfer") {
    if (payment.status === "pending") {
      await pool.query(
        `UPDATE payments SET status = 'awaiting_ratification' WHERE id = $1`,
        [payment.id],
      );
    }
    return;
  }

  if (op.operation_type === "escrow_approve") {
    // Once we see an approve at LIB, treat as escrowed (agent + freelancer path).
    if (
      payment.status === "awaiting_ratification" ||
      payment.status === "pending"
    ) {
      await pool.query(`UPDATE payments SET status = 'escrowed' WHERE id = $1`, [
        payment.id,
      ]);
      await pool.query(
        `
        UPDATE milestones SET status = 'funded'
        WHERE id = $1 AND status IN ('pending', 'funded')
        `,
        [payment.milestone_id],
      );
    }
    return;
  }

  if (op.operation_type === "escrow_release") {
    const receiver =
      (op.payload.receiver as string | undefined) ?? op.to_account;
    const from = (op.payload.from as string | undefined) ?? op.from_account;

    // Cooperative refund: receiver is the original client (from of escrow).
    // Happy-path release: receiver is freelancer (to of escrow).
    const to = (op.payload.to as string | undefined) ?? null;
    const isRefund =
      receiver != null && from != null && to != null && receiver === from;

    if (isRefund) {
      await pool.query(`UPDATE payments SET status = 'refunded' WHERE id = $1`, [
        payment.id,
      ]);
    } else {
      await pool.query(`UPDATE payments SET status = 'released' WHERE id = $1`, [
        payment.id,
      ]);
      await pool.query(
        `UPDATE milestones SET status = 'released' WHERE id = $1`,
        [payment.milestone_id],
      );
    }
  }
}
