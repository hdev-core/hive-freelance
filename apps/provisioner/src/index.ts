import { createHash, randomBytes } from "node:crypto";
import {
  createChain,
  createKmsSigner,
  creatorKeyRef,
  putCustodialKeys,
  userActiveKeyRef,
} from "@hive-freelance/hive";

export type ProvisionResult = {
  dryRun: boolean;
  hiveUsername: string;
  kmsKeyRef: string | null;
  ownerKeyRef: string | null;
  message: string;
};

function isLive(): boolean {
  return process.env.PROVISIONER_LIVE === "true";
}

/** Generate a Hive-legal username from email (3–16 chars, lowercase). */
export function suggestHiveUsername(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hash = createHash("sha256").update(email).digest("hex").slice(0, 6);
  const base = (cleaned.slice(0, 8) || "user") + hash;
  return `hf${base}`.slice(0, 16);
}

export async function isHiveUsernameAvailable(
  username: string,
): Promise<boolean> {
  try {
    const chain = await createChain();
    // Use JSON-RPC via chain handle's getBlock path pattern — query accounts
    const apiNode = process.env.HIVE_API_NODE ?? "https://api.hive.blog";
    await chain.close();
    const res = await fetch(apiNode, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "condenser_api.get_accounts",
        params: [[username]],
      }),
    });
    const body = (await res.json()) as { result?: unknown[] };
    return !body.result?.[0];
  } catch {
    // If RPC fails in dry-run, still allow synthetic names
    return true;
  }
}

export async function allocateHiveUsername(email: string): Promise<string> {
  let candidate = suggestHiveUsername(email);
  for (let i = 0; i < 5; i++) {
    if (await isHiveUsernameAvailable(candidate)) return candidate;
    candidate = `hf${randomBytes(4).toString("hex")}`.slice(0, 16);
  }
  return `hf${randomBytes(6).toString("hex")}`.slice(0, 16);
}

export async function createHiveAccount(
  hiveUsername: string,
): Promise<ProvisionResult> {
  const live = isLive();
  const { activeRef, ownerRef } = putCustodialKeys(hiveUsername, {});

  if (!live) {
    console.info(
      `[provisioner] dry-run account_create for @${hiveUsername} (set PROVISIONER_LIVE=true to broadcast)`,
    );
    return {
      dryRun: true,
      hiveUsername,
      kmsKeyRef: activeRef,
      ownerKeyRef: ownerRef,
      message: "Dry-run: account_create not broadcast; custodial refs stored in local vault",
    };
  }

  const creator = process.env.PROVISIONER_CREATOR_ACCOUNT;
  if (!creator) {
    throw new Error("PROVISIONER_CREATOR_ACCOUNT required when PROVISIONER_LIVE=true");
  }

  const kms = createKmsSigner();
  const keyRef = creatorKeyRef(creator);
  const has = await kms.hasKey(keyRef);
  if (!has) {
    throw new Error(`Creator key missing for ${keyRef}`);
  }

  const chain = await createChain();
  await chain.getDynamicGlobalProperties();
  await chain.close();

  await kms.signWithKms(creator, keyRef, [
    { account_create: { new_account_name: hiveUsername } },
  ]);

  return {
    dryRun: true,
    hiveUsername,
    kmsKeyRef: activeRef,
    ownerKeyRef: ownerRef,
    message:
      "Live mode connected to chain + KMS stub; full account_create broadcast TBD",
  };
}

export async function delegateRc(hiveUsername: string): Promise<ProvisionResult> {
  const live = isLive();

  if (!live) {
    console.info(
      `[provisioner] dry-run delegate_vesting_shares (RC) for @${hiveUsername}`,
    );
    return {
      dryRun: true,
      hiveUsername,
      kmsKeyRef: null,
      ownerKeyRef: null,
      message: "Dry-run: RC delegation not broadcast",
    };
  }

  const creator = process.env.PROVISIONER_CREATOR_ACCOUNT;
  if (!creator) {
    throw new Error("PROVISIONER_CREATOR_ACCOUNT required when PROVISIONER_LIVE=true");
  }

  const kms = createKmsSigner();
  const keyRef = creatorKeyRef(creator);
  await kms.signWithKms(creator, keyRef, [
    { delegate_vesting_shares: { delegatee: hiveUsername } },
  ]);

  return {
    dryRun: true,
    hiveUsername,
    kmsKeyRef: null,
    ownerKeyRef: null,
    message: "Live mode KMS stub invoked for RC delegation (broadcast TBD)",
  };
}

export async function storeCustodialKey(
  userId: number | string,
  keyRef: string,
): Promise<{ userId: string; keyRef: string }> {
  const kms = createKmsSigner();
  console.info(
    `[provisioner] storeCustodialKey user=${userId} ref=${keyRef} mode=${kms.mode}`,
  );
  return { userId: String(userId), keyRef };
}

export async function provisionGoogleUser(opts: {
  email: string;
  hiveUsername?: string;
}): Promise<{
  hiveUsername: string;
  account: ProvisionResult;
  rc: ProvisionResult;
  kmsKeyRef: string;
}> {
  const hiveUsername =
    opts.hiveUsername ?? (await allocateHiveUsername(opts.email));
  const account = await createHiveAccount(hiveUsername);
  const rc = await delegateRc(hiveUsername);
  const kmsKeyRef = account.kmsKeyRef ?? userActiveKeyRef(hiveUsername);
  await storeCustodialKey("pending", kmsKeyRef);
  return { hiveUsername, account, rc, kmsKeyRef };
}
