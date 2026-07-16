import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closePool,
  getListenerCursor,
  markHiveRecordsConfirmed,
  setListenerCursor,
  upsertHiveRecord,
} from "@hive-freelance/db";
import { createChain } from "@hive-freelance/hive";
import { filterBlockOps } from "./filter.js";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadEnv({ path: resolve(rootDir, ".env") });
loadEnv({ path: resolve(rootDir, ".env.example") });

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
      cursor = Math.max(head - 1, 0);
      await setListenerCursor(cursor);
      console.log(`[listener] initialized cursor at ${cursor} (head=${head})`);
    }

    // Process up to a small batch per tick to avoid falling behind loudly.
    const maxBatch = 5;
    let processed = 0;

    while (cursor < head && processed < maxBatch) {
      const next = cursor + 1;
      const block = await chain.getBlock(next);
      if (!block) {
        console.warn(`[listener] missing block ${next}`);
        break;
      }

      const ops = filterBlockOps(next, block);
      for (const op of ops) {
        // LIB gate: never confirm on first-seen (head may fork).
        const confirmed = op.block_number <= lib;
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
        console.log(
          `[listener] ${op.operation_type} tx=${op.hive_tx_id} block=${op.block_number} confirmed=${confirmed}`,
        );
      }

      cursor = next;
      await setListenerCursor(cursor);
      processed += 1;
    }

    const confirmedCount = await markHiveRecordsConfirmed(lib);
    if (confirmedCount > 0) {
      console.log(
        `[listener] marked ${confirmedCount} record(s) confirmed at LIB=${lib}`,
      );
    }
  } finally {
    await chain.close();
  }
}

async function main(): Promise<void> {
  console.log(
    `[listener] starting (poll=${pollMs}ms). MVP custom stream — Phase 2 migrates to HAF.`,
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
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
