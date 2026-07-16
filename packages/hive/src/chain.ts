import { APP_ID, ESCROW_OP_TYPES, TRACKED_OP_TYPES } from "@hive-freelance/shared";

export { APP_ID, ESCROW_OP_TYPES, TRACKED_OP_TYPES };

export type HiveChainHandle = {
  /** Raw WAX chain instance (typed loosely until feature code needs specifics). */
  wax: unknown;
  apiNode: string;
  getDynamicGlobalProperties: () => Promise<DynamicGlobalProperties>;
  getBlock: (blockNum: number) => Promise<HiveBlock | null>;
  close: () => Promise<void>;
};

export type DynamicGlobalProperties = {
  head_block_number: number;
  last_irreversible_block_num: number;
  head_block_id?: string;
  time?: string;
};

export type HiveBlockTransaction = {
  transaction_id: string;
  operations: Array<[string, Record<string, unknown>]>;
};

export type HiveBlock = {
  block_id?: string;
  previous?: string;
  timestamp: string;
  transactions: HiveBlockTransaction[];
};

type JsonRpcResult<T> = { result?: T; error?: { message: string } };

async function jsonRpc<T>(
  apiNode: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(apiNode, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new Error(`Hive RPC HTTP ${res.status} for ${method}`);
  }

  const body = (await res.json()) as JsonRpcResult<T>;
  if (body.error) {
    throw new Error(`Hive RPC error: ${body.error.message}`);
  }
  if (body.result === undefined) {
    throw new Error(`Hive RPC empty result for ${method}`);
  }
  return body.result;
}

/**
 * Creates a Hive chain handle.
 * Prefer @hiveio/wax when available; fall back to condenser_api JSON-RPC
 * for reads so local health checks work even if WASM init fails.
 */
export async function createChain(
  apiNode = process.env.HIVE_API_NODE ?? "https://api.hive.blog",
): Promise<HiveChainHandle> {
  let wax: unknown = null;

  try {
    const waxMod = await import("@hiveio/wax");
    const createHiveChain =
      (waxMod as { createHiveChain?: (opts?: { apiEndpoint?: string }) => Promise<unknown> })
        .createHiveChain;
    if (createHiveChain) {
      wax = await createHiveChain({ apiEndpoint: apiNode });
    }
  } catch (err) {
    console.warn(
      "[hive] @hiveio/wax init failed; using JSON-RPC read path only:",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    wax,
    apiNode,
    async getDynamicGlobalProperties() {
      const props = await jsonRpc<DynamicGlobalProperties>(
        apiNode,
        "condenser_api.get_dynamic_global_properties",
        [],
      );
      return {
        head_block_number: Number(props.head_block_number),
        last_irreversible_block_num: Number(props.last_irreversible_block_num),
        head_block_id: props.head_block_id,
        time: props.time,
      };
    },
    async getBlock(blockNum: number) {
      const block = await jsonRpc<HiveBlock | null>(
        apiNode,
        "condenser_api.get_block",
        [blockNum],
      );
      if (!block) return null;
      return {
        ...block,
        transactions: (block.transactions ?? []).map((tx, idx) => ({
          transaction_id:
            (tx as { transaction_id?: string }).transaction_id ??
            `${blockNum}-${idx}`,
          operations: (tx.operations ?? []) as Array<
            [string, Record<string, unknown>]
          >,
        })),
      };
    },
    async close() {
      // WAX instances may expose destroy/close in future; no-op for now.
    },
  };
}
