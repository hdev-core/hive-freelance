import { APP_ID, ESCROW_OP_TYPES, TRACKED_OP_TYPES } from "@hive-freelance/shared";

export { APP_ID, ESCROW_OP_TYPES, TRACKED_OP_TYPES };

export type HiveChainHandle = {
  /** Raw WAX chain instance (typed loosely until feature code needs specifics). */
  wax: unknown;
  apiNode: string;
  getDynamicGlobalProperties: () => Promise<DynamicGlobalProperties>;
  getBlock: (blockNum: number) => Promise<HiveBlock | null>;
  /**
   * No-op for the shared process chain — use `closeHiveChain()` on shutdown.
   * Callers may still `await chain.close()` in finally blocks safely.
   */
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

type HiveChainState = {
  apiNode: string;
  handle: HiveChainHandle;
};

declare global {
  // eslint-disable-next-line no-var
  var __hiveChain: HiveChainState | undefined;
  // eslint-disable-next-line no-var
  var __hiveChainInit: Promise<HiveChainHandle> | undefined;
}

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

function buildHandle(apiNode: string, wax: unknown): HiveChainHandle {
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
      // Shared process chain — use closeHiveChain() on shutdown instead.
    },
  };
}

async function initChain(apiNode: string): Promise<HiveChainHandle> {
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

  const handle = buildHandle(apiNode, wax);
  global.__hiveChain = { apiNode, handle };
  return handle;
}

/**
 * Returns the process-scoped Hive chain handle (one WAX instance per apiNode).
 * Prefer @hiveio/wax when available; fall back to condenser_api JSON-RPC
 * for reads so local health checks work even if WASM init fails.
 * Call `closeHiveChain()` on process shutdown — per-call `close()` is a no-op.
 */
export async function createChain(
  apiNode = process.env.HIVE_API_NODE ?? "https://api.hive.blog",
): Promise<HiveChainHandle> {
  const existing = global.__hiveChain;
  if (existing) {
    if (existing.apiNode !== apiNode) {
      throw new Error(
        "Hive chain already initialized with a different apiNode",
      );
    }
    return existing.handle;
  }

  if (global.__hiveChainInit) {
    const handle = await global.__hiveChainInit;
    if (handle.apiNode !== apiNode) {
      throw new Error(
        "Hive chain already initialized with a different apiNode",
      );
    }
    return handle;
  }

  const init = initChain(apiNode).finally(() => {
    global.__hiveChainInit = undefined;
  });
  global.__hiveChainInit = init;
  return init;
}

/**
 * Tears down the shared WAX chain (process shutdown). Safe if never opened.
 * Clears the global before delete so concurrent callers cannot reuse it.
 * `@hiveio/wax@2.0.2` exposes `delete()` on the chain instance.
 */
export async function closeHiveChain(): Promise<void> {
  const existing = global.__hiveChain;
  global.__hiveChain = undefined;
  global.__hiveChainInit = undefined;
  if (!existing) return;

  const wax = existing.handle.wax as { delete?: () => void } | null;
  if (wax && typeof wax.delete === "function") {
    try {
      wax.delete();
    } catch (err) {
      console.warn(
        "[hive] wax.delete() failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}
