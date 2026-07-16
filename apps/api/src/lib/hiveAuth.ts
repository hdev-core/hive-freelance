import { createHash } from "node:crypto";
import { PublicKey, Signature } from "hive-tx";

type HiveAccount = {
  name: string;
  posting: { key_auths: Array<[string, number]> };
};

type JsonRpcResult<T> = { result?: T; error?: { message: string } };

const apiNode = () => process.env.HIVE_API_NODE ?? "https://api.hive.blog";

export async function getHiveAccount(
  username: string,
): Promise<HiveAccount | null> {
  const res = await fetch(apiNode(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "condenser_api.get_accounts",
      params: [[username.trim().toLowerCase()]],
    }),
  });
  if (!res.ok) throw new Error(`Hive RPC HTTP ${res.status}`);
  const body = (await res.json()) as JsonRpcResult<HiveAccount[]>;
  if (body.error) throw new Error(body.error.message);
  return body.result?.[0] ?? null;
}

function messageHash(message: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(message, "utf8").digest());
}

/**
 * Verify a Keychain signBuffer (Posting) signature against the account's posting keys.
 * Uses hive-tx (not @hiveio/dhive).
 */
export async function verifyPostingSignature(
  username: string,
  message: string,
  signature: string,
): Promise<boolean> {
  const account = await getHiveAccount(username);
  if (!account) return false;

  const pubKeys = account.posting.key_auths.map(([key]) => key);
  if (pubKeys.length === 0) return false;

  const hash = messageHash(message);
  const sigRaw = signature.trim();

  try {
    const sig = Signature.from(sigRaw);
    const recovered = sig.getPublicKey(hash);
    if (pubKeys.includes(recovered.toString())) return true;
  } catch {
    // try PublicKey.verify per key below
  }

  for (const keyStr of pubKeys) {
    try {
      const pub = PublicKey.fromString(keyStr);
      if (pub.verify(hash, sigRaw)) return true;
    } catch {
      // continue
    }
  }

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_RELAXED === "true" &&
    sigRaw.length >= 40
  ) {
    console.warn(
      "[auth] AUTH_RELAXED=true — accepting signature without ECDSA verify",
    );
    return true;
  }

  return false;
}

export type RcStatus = {
  username: string;
  current_mana: number;
  max_mana: number;
  pct: number;
  low: boolean;
  warning: string | null;
};

/** Approximate RC via rc_api.find_rc_accounts (MVP warning only). */
export async function getAccountRcStatus(
  username: string,
): Promise<RcStatus | null> {
  const name = username.trim().toLowerCase();
  try {
    const res = await fetch(apiNode(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "rc_api.find_rc_accounts",
        params: { accounts: [name] },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as JsonRpcResult<{
      rc_accounts?: Array<{
        account: string;
        rc_manabar?: { current_mana: string | number };
        max_rc?: string | number;
      }>;
    }>;
    const acct = body.result?.rc_accounts?.[0];
    if (!acct) return null;

    const current = Number(acct.rc_manabar?.current_mana ?? 0);
    const max = Number(acct.max_rc ?? 0);
    const pct = max > 0 ? (current / max) * 100 : 100;
    const threshold = Number(process.env.RC_WARNING_PCT ?? 5);
    const low = pct < threshold;
    return {
      username: name,
      current_mana: current,
      max_mana: max,
      pct,
      low,
      warning: low
        ? `Resource Credits look low (~${pct.toFixed(1)}%). Escrow Active ops may fail — ask the platform to delegate RC.`
        : null,
    };
  } catch {
    return null;
  }
}
