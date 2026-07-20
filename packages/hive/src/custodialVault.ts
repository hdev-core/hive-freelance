/**
 * In-memory KMS stub registry for per-user custodial keys (Google path).
 * Generates real secp256k1 keypairs (via hive-tx) so custodial accounts have
 * genuine signing authority — never logs or returns private key material.
 * Production replaces this with real KMS/HSM.
 */
import { PrivateKey } from "hive-tx";

type CustodialKeySet = {
  owner: string;
  active: string;
  posting: string;
  memo: string;
};

export type CustodialPublicKeys = {
  owner: string;
  active: string;
  posting: string;
  memo: string;
};

const vault = new Map<string, CustodialKeySet>();

export function userOwnerKeyRef(hiveUsername: string): string {
  return `local:user:owner:${hiveUsername}`;
}

export function userActiveKeyRef(hiveUsername: string): string {
  return `local:user:active:${hiveUsername}`;
}

export function userPostingKeyRef(hiveUsername: string): string {
  return `local:user:posting:${hiveUsername}`;
}

export function userMemoKeyRef(hiveUsername: string): string {
  return `local:user:memo:${hiveUsername}`;
}

/**
 * Generates a real owner/active/posting/memo keypair for a newly provisioned
 * custodial account and stores the private keys in the in-memory vault.
 * Returns only the public keys (safe for account_create authorities / logs).
 */
export function generateCustodialKeys(
  hiveUsername: string,
): CustodialPublicKeys {
  const owner = PrivateKey.randomKey();
  const active = PrivateKey.randomKey();
  const posting = PrivateKey.randomKey();
  const memo = PrivateKey.randomKey();

  vault.set(hiveUsername, {
    owner: owner.toString(),
    active: active.toString(),
    posting: posting.toString(),
    memo: memo.toString(),
  });

  return {
    owner: owner.createPublic().toString(),
    active: active.createPublic().toString(),
    posting: posting.createPublic().toString(),
    memo: memo.createPublic().toString(),
  };
}

export function hasCustodialKey(
  hiveUsername: string,
  which: keyof CustodialKeySet,
): boolean {
  const entry = vault.get(hiveUsername);
  return Boolean(entry?.[which]);
}

export function wipeCustodialKeys(hiveUsername: string): void {
  vault.delete(hiveUsername);
}

export function getCustodialPresence(hiveUsername: string): {
  hasOwner: boolean;
  hasActive: boolean;
  hasPosting: boolean;
  hasMemo: boolean;
} {
  const entry = vault.get(hiveUsername);
  return {
    hasOwner: Boolean(entry?.owner),
    hasActive: Boolean(entry?.active),
    hasPosting: Boolean(entry?.posting),
    hasMemo: Boolean(entry?.memo),
  };
}
