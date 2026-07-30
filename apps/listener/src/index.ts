import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closePrisma,
  getListenerCursor,
  markHiveRecordsConfirmed,
  setListenerCursor,
  upsertHiveRecord,
} from "@hive-freelance/db";
import { createChain } from "@hive-freelance/hive";
import { filterBlockOps } from "./filter.js";
import {
  resetMissedRatifications,
  syncPaymentFromEscrowOp,
} from "./paymentSync.js";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadEnv({ path: resolve(rootDir, ".env") });

const pollMs = Number(process.env.LISTENER_POLL_MS ?? 3000);
const startFromHead = process.env.LISTENER_START_FROM_HEAD !== "false";

let running = true;

async function tick(): Promise<void> {
  const chain = await createChain();
  try {
    const props = await chain.getDynamicGlobalProperties();
    const head = props.head_block_number;
    const lib = props.last_irreversible_block_num;

    let cursor = await getListenerCursor();
    if (cursor <= 0 && startFromHead) {
      cursor = Math.max(lib - 1, 0);
      await setListenerCursor(cursor);
      console.log(
        `[listener] initialized cursor at ${cursor} (lib=${lib} head=${head})`,
      );
    }

    // Process up to a small batch per tick to avoid falling behind loudly.
    const maxBatch = 5;
    let processed = 0;

    while (cursor < lib && processed < maxBatch) {
      const next = cursor + 1;
      const block = await chain.getBlock(next);
      if (!block) {
        console.warn(`[listener] missing block ${next}`);
        break;
      }

      const ops = filterBlockOps(next, block);
      for (const op of ops) {
        // Only process through LIB — never confirm / mutate payments on head forks.
        const confirmed = true;
        await upsertHiveRecord({
          hive_tx_id: op.hive_tx_id,
          app_id: op.app_id,
          operation_type: op.operation_type,
          from_account: op.from_account,
          to_account: op.to_account,
          escrow_id: op.escrow_id,
          payload: op.payload,
          block_number: op.block_number,
          block_timestamp: op.block_timestamp,
          confirmed,
        });

        if (
          op.operation_type === "escrow_transfer" ||
          op.operation_type === "escrow_approve" ||
          op.operation_type === "escrow_release"
        ) {
          await syncPaymentFromEscrowOp({
            operation_type: op.operation_type,
            escrow_id: op.escrow_id,
            from_account: op.from_account,
            to_account: op.to_account,
            payload: op.payload,
            confirmed: true,
          });
        }

        console.log(
          `[listener] ${op.operation_type} tx=${op.hive_tx_id} block=${op.block_number} confirmed=true`,
        );
      }

      cursor = next;
      await setListenerCursor(cursor);
      processed += 1;
    }

    // Catch-up: confirm any earlier head-seen records (legacy) now past LIB.
    const confirmedCount = await markHiveRecordsConfirmed(lib);
    if (confirmedCount > 0) {
      console.log(
        `[listener] marked ${confirmedCount} record(s) confirmed at LIB=${lib}`,
      );
    }

    const missed = await resetMissedRatifications();
    if (missed > 0) {
      console.log(`[listener] reset ${missed} missed-ratification payment(s)`);
    }
  } finally {
    await chain.close();
  }
}

async function main(): Promise<void> {
  console.log(
    `[listener] starting (poll=${pollMs}ms). Interim escrow sync into hive_records — Milestone 1 acceptance reads use HAF (HAF_DATABASE_URL), not this listener.`,
  );

  while (running) {
    try {
      await tick();
    } catch (err) {
      console.error("[listener] tick failed:", err);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

async function shutdown() {
  running = false;
  await closePrisma();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

main().catch(async (err) => {
  console.error(err);
  await closePrisma();
  process.exit(1);
});