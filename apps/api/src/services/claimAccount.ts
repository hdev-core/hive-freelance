import {
  createKmsSigner,
  hasCustodialKey,
  wipeCustodialKeys,
} from "@hive-freelance/hive";
import { AppError } from "../lib/errors.js";
import { getUserById, markUserClaimed } from "./users.js";

export type ClaimKeys = {
  owner_key: string;
  active_key: string;
  posting_key: string;
  memo_key: string;
};

function claimLive(): boolean {
  return process.env.CLAIM_LIVE === "true";
}

/**
 * Hand over custodial Google account to user-owned keys (account_update2).
 * Dry-run by default; always updates DB + wipes local vault on success path.
 */
export async function claimAccount(
  userId: string,
  keys: ClaimKeys,
): Promise<{
  dryRun: boolean;
  username: string;
  message: string;
}> {
  const user = await getUserById(userId);
  if (!user) throw new AppError(404, "User not found");

  if (user.auth_type === "keychain" || user.auth_type === "claimed") {
    throw new AppError(
      400,
      "Account is already self-custodial",
      "ALREADY_CLAIMED",
    );
  }
  if (user.auth_type !== "google") {
    throw new AppError(400, "Only Google-provisioned accounts can be claimed");
  }

  for (const [name, value] of Object.entries(keys)) {
    if (!value || value.length < 10) {
      throw new AppError(400, `Invalid public key: ${name}`);
    }
  }

  const username = user.hive_username;
  const hasOwner = hasCustodialKey(username, "owner");
  if (!hasOwner && process.env.NODE_ENV === "production" && claimLive()) {
    throw new AppError(500, "Custodial owner key missing from vault");
  }

  const live = claimLive();
  const accountUpdate2 = {
    account: username,
    owner: { weight_threshold: 1, account_auths: [], key_auths: [[keys.owner_key, 1]] },
    active: { weight_threshold: 1, account_auths: [], key_auths: [[keys.active_key, 1]] },
    posting: {
      weight_threshold: 1,
      account_auths: [],
      key_auths: [[keys.posting_key, 1]],
    },
    memo_key: keys.memo_key,
    json_metadata: "",
  };

  if (live) {
    const kms = createKmsSigner();
    const ownerRef = `local:user:owner:${username}`;
    await kms.signWithKms(username, ownerRef, [
      { account_update2: accountUpdate2 },
    ]);
  } else {
    console.info(
      `[claim] dry-run account_update2 for @${username} (set CLAIM_LIVE=true to broadcast)`,
      { keys_present: Object.keys(keys) },
    );
  }

  wipeCustodialKeys(username);
  await markUserClaimed(userId);

  return {
    dryRun: !live,
    username,
    message:
      "Your account is now fully yours. Install Hive Keychain to continue signing. The platform can no longer sign for you.",
  };
}
