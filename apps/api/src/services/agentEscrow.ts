import { createHash } from "node:crypto";
import { getPool } from "@hive-freelance/db";
import { agentKeyRef, createKmsSigner } from "@hive-freelance/hive";

function agentAccount(): string {
  return process.env.AGENT_ACCOUNT ?? "hive-freelance-agent";
}

function agentLive(): boolean {
  return process.env.AGENT_LIVE === "true";
}

/**
 * Deterministic escrow_id from payment + parties (doc 05).
 * Truncate SHA256 to uint32; collide → rehash with salt.
 */
export async function computeEscrowId(
  paymentId: string,
  from: string,
  to: string,
): Promise<number> {
  const pool = getPool();
  let salt = 0;
  for (;;) {
    const material = `${paymentId}:${from}:${to}:${salt}`;
    const hash = createHash("sha256").update(material).digest();
    const id = hash.readUInt32BE(0);
    const clash = await pool.query(
      `SELECT 1 FROM payments WHERE escrow_id = $1 AND id <> $2 LIMIT 1`,
      [id, paymentId],
    );
    if ((clash.rowCount ?? 0) === 0) return id;
    salt += 1;
    if (salt > 1000) {
      throw new Error("Unable to allocate unique escrow_id");
    }
  }
}

export async function agentAutoApprove(opts: {
  paymentId: string;
  escrowId: number;
  from: string;
  to: string;
}): Promise<{ dryRun: boolean; agent_approve_tx_id: string | null }> {
  const agent = agentAccount();
  const op = {
    escrow_approve: {
      from: opts.from,
      to: opts.to,
      agent,
      who: agent,
      escrow_id: opts.escrowId,
      approve: true,
    },
  };

  const live = agentLive();
  const kms = createKmsSigner();
  const keyRef = agentKeyRef();
  let dryRun = true;
  let agent_approve_tx_id: string | null = null;

  try {
    const has = await kms.hasKey(keyRef).catch(() => false);
    if (has) {
      await kms.signWithKms(agent, keyRef, [op]);
    }
    if (live && has) {
      // Full WAX broadcast lands with production KMS; record pending id for now.
      dryRun = false;
      agent_approve_tx_id = `agent-live-pending-${opts.escrowId}-${Date.now()}`;
      console.info(
        `[agentEscrow] AGENT_LIVE approve for escrow ${opts.escrowId} (broadcast TBD via WAX)`,
      );
    } else {
      agent_approve_tx_id = `agent-dry-run-${opts.escrowId}-${Date.now()}`;
      console.info(
        `[agentEscrow] dry-run escrow_approve escrow_id=${opts.escrowId} from=${opts.from} to=${opts.to}`,
        op,
      );
    }
  } catch (err) {
    console.warn("[agentEscrow] approve failed:", err);
    agent_approve_tx_id = `agent-error-${opts.escrowId}`;
  }

  await getPool().query(
    `
    INSERT INTO agent_signing_events (payment_id, escrow_id, operation_type, dry_run, details)
    VALUES ($1, $2, 'escrow_approve', $3, $4)
    `,
    [
      opts.paymentId,
      opts.escrowId,
      dryRun,
      JSON.stringify({ from: opts.from, to: opts.to, agent, op }),
    ],
  );

  if (agent_approve_tx_id) {
    await getPool().query(
      `UPDATE payments SET agent_approve_tx_id = $2 WHERE id = $1`,
      [opts.paymentId, agent_approve_tx_id],
    );
  }

  return { dryRun, agent_approve_tx_id };
}
