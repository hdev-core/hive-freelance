import { APP_ID, ESCROW_OP_TYPES, isTrackedOpType } from "@hive-freelance/shared";
import type { HiveBlock } from "@hive-freelance/hive";

export type FilteredOp = {
  hive_tx_id: string;
  app_id: string;
  operation_type: string;
  from_account: string | null;
  to_account: string | null;
  escrow_id: number | null;
  payload: Record<string, unknown>;
  block_number: number;
  block_timestamp: string;
};

const ESCROW_SET = new Set<string>(ESCROW_OP_TYPES);

function customJsonMatchesApp(payload: Record<string, unknown>): boolean {
  const id = payload.id;
  if (typeof id === "string" && id === APP_ID) return true;

  const json = payload.json;
  if (typeof json === "string") {
    try {
      const parsed = JSON.parse(json) as { app_id?: string };
      return parsed.app_id === APP_ID;
    } catch {
      return false;
    }
  }
  if (json && typeof json === "object" && "app_id" in json) {
    return (json as { app_id?: string }).app_id === APP_ID;
  }
  return false;
}

/**
 * MVP custom listener — hand-rolled subset of HAF.
 * Phase 2: replace with HAF (Hive Application Framework) for fork handling + full SQL.
 */
export function filterBlockOps(
  blockNum: number,
  block: HiveBlock,
): FilteredOp[] {
  const out: FilteredOp[] = [];

  for (const tx of block.transactions ?? []) {
    for (const [opType, payload] of tx.operations ?? []) {
      if (!isTrackedOpType(opType)) continue;

      if (opType === "custom_json" && !customJsonMatchesApp(payload)) {
        continue;
      }

      // Escrow ops are always relevant when they involve our agent later;
      // for scaffold we store all escrow_* seen (narrow with agent filter in escrow milestone).
      if (
        !ESCROW_SET.has(opType) &&
        opType !== "custom_json" &&
        opType !== "account_create" &&
        opType !== "delegate_vesting_shares"
      ) {
        continue;
      }

      // For non-escrow/non-app ops, skip noise unless custom_json matched above.
      if (
        (opType === "account_create" || opType === "delegate_vesting_shares") &&
        process.env.LISTENER_CAPTURE_PROVISIONING !== "true"
      ) {
        continue;
      }

      out.push({
        hive_tx_id: `${tx.transaction_id}:${opType}`,
        app_id: APP_ID,
        operation_type: opType,
        from_account:
          (payload.from as string | undefined) ??
          (payload.account as string | undefined) ??
          (payload.creator as string | undefined) ??
          null,
        to_account:
          (payload.to as string | undefined) ??
          (payload.delegatee as string | undefined) ??
          (payload.new_account_name as string | undefined) ??
          null,
        escrow_id:
          typeof payload.escrow_id === "number"
            ? payload.escrow_id
            : typeof payload.escrow_id === "string"
              ? Number(payload.escrow_id)
              : null,
        payload,
        block_number: blockNum,
        block_timestamp: block.timestamp,
      });
    }
  }

  return out;
}
