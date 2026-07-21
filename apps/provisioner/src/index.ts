import { createHash, randomBytes } from "node:crypto";
import {
  createChain,
  createKmsSigner,
  creatorKeyRef,
  generateCustodialKeys,
  userActiveKeyRef,
  userOwnerKeyRef,
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
  // Real keypair, generated server-side and held only in the in-memory
  // custodial vault — the WIF private keys never leave this process.
  const publicKeys = generateCustodialKeys(hiveUsername);
  const activeRef = userActiveKeyRef(hiveUsername);
  const ownerRef = userOwnerKeyRef(hiveUsername);

  if (!live) {
    console.info(
      `[provisioner] dry-run account_create for @${hiveUsername} (set PROVISIONER_LIVE=true to broadcast)`,
    );
    return {
      dryRun: true,
      hiveUsername,
      kmsKeyRef: activeRef,
      ownerKeyRef: ownerRef,
      message:
        "Dry-run: account_create not broadcast; real custodial keypair generated and held in local vault",
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
  await chain.close();

  const fee = process.env.HIVE_ACCOUNT_CREATION_FEE ?? "3.000 HIVE";

  await kms.signWithKms(creator, keyRef, [
    {
      account_create: {
        fee,
        creator,
        new_account_name: hiveUsername,
        owner: {
          weight_threshold: 1,
          account_auths: [],
          key_auths: [[publicKeys.owner, 1]],
        },
        active: {
          weight_threshold: 1,
          account_auths: [],
          key_auths: [[publicKeys.active, 1]],
        },
        posting: {
          weight_threshold: 1,
          account_auths: [],
          key_auths: [[publicKeys.posting, 1]],
        },
        memo_key: publicKeys.memo,
        json_metadata: "",
      },
    },
  ]);

  return {
    dryRun: false,
    hiveUsername,
    kmsKeyRef: activeRef,
    ownerKeyRef: ownerRef,
    message: `account_create broadcast by @${creator} for @${hiveUsername} (via HIVE_API_NODE=${process.env.HIVE_API_NODE ?? "https://api.hive.blog"})`,
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
  const vestingShares = process.env.HIVE_RC_DELEGATION_VESTS ?? "10.000000 VESTS";

  await kms.signWithKms(creator, keyRef, [
    {
      delegate_vesting_shares: {
        delegator: creator,
        delegatee: hiveUsername,
        vesting_shares: vestingShares,
      },
    },
  ]);

  return {
    dryRun: false,
    hiveUsername,
    kmsKeyRef: null,
    ownerKeyRef: null,
    message: `delegate_vesting_shares broadcast by @${creator} for @${hiveUsername}`,
  };
}

export async function provisionGoogleUser(opts: {
  email: string;
  hiveUsername?: string;
}): Promise<{
  hiveUsername: string;
  account: ProvisionResult;
  rc: ProvisionResult | null;
  rcWarning: string | null;
  kmsKeyRef: string;
}> {
  const hiveUsername =
    opts.hiveUsername ?? (await allocateHiveUsername(opts.email));
  const account = await createHiveAccount(hiveUsername);

  let rc: ProvisionResult | null = null;
  let rcWarning: string | null = null;
  try {
    rc = await delegateRc(hiveUsername);
  } catch (err) {
    // The Hive account (or its dry-run placeholder) already exists at this
    // point — don't lose the username/DB mapping over an RC failure. Surface
    // it so the caller can warn the user and retry delegation later instead.
    rcWarning = `RC delegation failed for @${hiveUsername}: ${
      err instanceof Error ? err.message : String(err)
    }. Account provisioned but may be unable to broadcast until RC is delegated.`;
    console.error(`[provisioner] ${rcWarning}`);
  }

  const kmsKeyRef = account.kmsKeyRef ?? userActiveKeyRef(hiveUsername);
  return { hiveUsername, account, rc, rcWarning, kmsKeyRef };
}
