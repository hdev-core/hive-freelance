import {
  createChain,
  createKmsSigner,
  creatorKeyRef,
} from "@hive-freelance/hive";

export type ProvisionResult = {
  dryRun: boolean;
  hiveUsername: string;
  kmsKeyRef: string | null;
  message: string;
};

function isLive(): boolean {
  return process.env.PROVISIONER_LIVE === "true";
}

/**
 * Creates a Hive account for a Google-provisioned user.
 * Dev default is dry-run logging. Live mode requires creator keys + PROVISIONER_LIVE=true.
 */
export async function createHiveAccount(
  hiveUsername: string,
): Promise<ProvisionResult> {
  const live = isLive();
  const kms = createKmsSigner();

  if (!live) {
    console.info(
      `[provisioner] dry-run account_create for @${hiveUsername} (set PROVISIONER_LIVE=true to broadcast)`,
    );
    return {
      dryRun: true,
      hiveUsername,
      kmsKeyRef: `local:user:${hiveUsername}`,
      message: "Dry-run: account_create not broadcast",
    };
  }

  const creator = process.env.PROVISIONER_CREATOR_ACCOUNT;
  if (!creator) {
    throw new Error("PROVISIONER_CREATOR_ACCOUNT required when PROVISIONER_LIVE=true");
  }

  const keyRef = creatorKeyRef(creator);
  const has = await kms.hasKey(keyRef);
  if (!has) {
    throw new Error(`Creator key missing for ${keyRef}`);
  }

  // Live path: build account_create via WAX + KMS in a later milestone.
  // For scaffold, validate chain connectivity and refuse silent success.
  const chain = await createChain();
  await chain.getDynamicGlobalProperties();
  await chain.close();

  await kms.signWithKms(creator, keyRef, [
    { account_create: { new_account_name: hiveUsername } },
  ]);

  return {
    dryRun: true,
    hiveUsername,
    kmsKeyRef: `local:user:${hiveUsername}`,
    message:
      "Live mode connected to chain + KMS stub; full account_create broadcast lands with escrow/auth work",
  };
}

/** Delegates RC (via vesting shares) so a new zero-RC account can transact. */
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
    message: "Live mode KMS stub invoked for RC delegation (broadcast TBD)",
  };
}

/** Stores custodial active-key reference for Google users (never logs key material). */
export async function storeCustodialKey(
  userId: number | string,
  keyRef: string,
): Promise<{ userId: string; keyRef: string }> {
  const kms = createKmsSigner();
  // In production this creates a per-user KMS key. Local stub only records the ref.
  console.info(
    `[provisioner] storeCustodialKey user=${userId} ref=${keyRef} mode=${kms.mode}`,
  );
  return { userId: String(userId), keyRef };
}

export async function provisionGoogleUser(opts: {
  hiveUsername: string;
  userId: number | string;
}): Promise<{
  account: ProvisionResult;
  rc: ProvisionResult;
  custodial: { userId: string; keyRef: string };
}> {
  const account = await createHiveAccount(opts.hiveUsername);
  const rc = await delegateRc(opts.hiveUsername);
  const custodial = await storeCustodialKey(
    opts.userId,
    account.kmsKeyRef ?? `local:user:${opts.hiveUsername}`,
  );
  return { account, rc, custodial };
}
