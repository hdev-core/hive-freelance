import { createHash } from "node:crypto";
import { APP_ID } from "@hive-freelance/shared";
import { createChain } from "./chain.js";
import { createKmsSigner, agentKeyRef } from "./kms.js";

export type CustomJsonDemoResult = {
  dryRun: boolean;
  hive_tx_id: string;
  waxLoaded: boolean;
  operation: {
    type: "custom_json_operation";
    value: {
      required_auths: string[];
      required_posting_auths: string[];
      id: string;
      json: string;
    };
  };
  /** Unsigned API-shaped transaction built by WAX (for evidence / inspection). */
  transaction?: Record<string, unknown>;
  message: string;
  path: "wax";
};

export type BuildCustomJsonDemoOpts = {
  account?: string;
  note?: string;
};

function liveEnabled(): boolean {
  return process.env.WAX_CUSTOM_JSON_LIVE === "true";
}

/**
 * Milestone 1 Phase C: build a `custom_json` via @hiveio/wax (not hand-shaped-only).
 * Default: dry-run mock hive_tx_id. Live broadcast only when WAX_CUSTOM_JSON_LIVE=true
 * and a local agent key is present (otherwise clear error — never fake live).
 */
export async function buildCustomJsonDemo(
  opts: BuildCustomJsonDemoOpts = {},
): Promise<CustomJsonDemoResult> {
  const account = (
    opts.account ??
    process.env.DEV_SEED_HIVE_USERNAME ??
    "hive-freelance-demo"
  )
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

  const body = {
    app: APP_ID,
    kind: "m1_wax_demo",
    ts: Date.now(),
    note: opts.note ?? "Milestone 1 WAX custom_json demo",
  };

  const chain = await createChain();
  if (!chain.wax) {
    await chain.close();
    throw new Error(
      "WAX failed to load (@hiveio/wax). Cannot claim a WAX-built custom_json.",
    );
  }

  try {
    const waxMod = await import("@hiveio/wax");
    const createHiveChain = waxMod.createHiveChain;
    const custom_json = waxMod.custom_json as {
      create: (v: Record<string, unknown>) => unknown;
      toJSON: (v: unknown) => {
        required_auths?: string[];
        required_posting_auths?: string[];
        id?: string;
        json?: string;
      };
    };

    const waxChain = await createHiveChain({ apiEndpoint: chain.apiNode });
    const tx = await (
      waxChain as unknown as {
        createTransaction: () => Promise<{
          pushOperation: (op: unknown) => void;
          id: string;
          toApiJson: () => Record<string, unknown>;
        }>;
      }
    ).createTransaction();

    const opValue = {
      required_auths: [] as string[],
      required_posting_auths: [account],
      id: APP_ID,
      json: JSON.stringify(body),
    };

    // Build through WAX protobuf helper, then push onto a WAX transaction.
    const proto = custom_json.create(opValue);
    const fromWax = custom_json.toJSON(proto);
    tx.pushOperation({
      custom_json_operation: {
        required_auths: fromWax.required_auths ?? [],
        required_posting_auths:
          fromWax.required_posting_auths ?? opValue.required_posting_auths,
        id: fromWax.id ?? APP_ID,
        json: fromWax.json ?? opValue.json,
      },
    });

    const apiTx = tx.toApiJson();
    const unsignedId =
      typeof tx.id === "string" && tx.id.length > 0
        ? tx.id
        : createHash("sha256")
            .update(JSON.stringify(apiTx))
            .digest("hex")
            .slice(0, 40);

    console.info(
      `[waxTx] built via @hiveio/wax custom_json id=${APP_ID} account=@${account} tx.id=${unsignedId}`,
    );

    const operation = {
      type: "custom_json_operation" as const,
      value: {
        required_auths: fromWax.required_auths ?? [],
        required_posting_auths:
          fromWax.required_posting_auths ?? opValue.required_posting_auths,
        id: fromWax.id ?? APP_ID,
        json: fromWax.json ?? opValue.json,
      },
    };

    if (!liveEnabled()) {
      const hive_tx_id = `mock-wax-custom-json-${Date.now()}`;
      return {
        dryRun: true,
        hive_tx_id,
        waxLoaded: true,
        operation,
        transaction: apiTx,
        message:
          "Dry-run: WAX built custom_json + unsigned tx. Set WAX_CUSTOM_JSON_LIVE=true to attempt broadcast.",
        path: "wax",
      };
    }

    // Live path: require local KMS agent key presence; full broadcast still
    // needs a signed tx — refuse rather than pretend success.
    const kms = createKmsSigner();
    const keyRef = agentKeyRef();
    const has = await kms.hasKey(keyRef).catch(() => false);
    if (!has) {
      throw new Error(
        "WAX_CUSTOM_JSON_LIVE=true but no LOCAL_AGENT_ACTIVE_KEY / agent KMS key — refusing fake live broadcast",
      );
    }

    await kms.signWithKms(
      process.env.AGENT_ACCOUNT ?? account,
      keyRef,
      [{ custom_json: operation.value }],
    );

    return {
      dryRun: false,
      hive_tx_id: `pending-wax-broadcast-${unsignedId}`,
      waxLoaded: true,
      operation,
      transaction: apiTx,
      message:
        "Live flag set: KMS sign stub invoked; wire full WAX broadcast when production keys are ready.",
      path: "wax",
    };
  } finally {
    await chain.close();
  }
}
