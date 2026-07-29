import { createHash } from "node:crypto";
import { PrivateKey } from "hive-tx";

/**
 * Signs Keychain-style challenges with a real, seeded throwaway Hive
 * account's posting key (mainnet — there's no usable public Hive testnet)
 * — so dev/local logins exercise the exact same verifyPostingSignature()
 * path as a real Keychain user, instead of bypassing signature verification.
 * See Auth_Guide.md for setup.
 */
export function devSignerConfigured(): boolean {
  return Boolean(
    process.env.DEV_SEED_HIVE_USERNAME && process.env.DEV_SEED_POSTING_KEY,
  );
}

export function devSeedUsername(): string {
  const username = process.env.DEV_SEED_HIVE_USERNAME;
  if (!username) {
    throw new Error("DEV_SEED_HIVE_USERNAME is not set");
  }
  return username.trim().toLowerCase();
}

export function signChallengeWithSeedAccount(challenge: string): string {
  const wif = process.env.DEV_SEED_POSTING_KEY;
  if (!wif) {
    throw new Error("DEV_SEED_POSTING_KEY is not set");
  }
  const hash = new Uint8Array(createHash("sha256").update(challenge, "utf8").digest());
  const key = PrivateKey.from(wif);
  return key.sign(hash).customToString();
}
