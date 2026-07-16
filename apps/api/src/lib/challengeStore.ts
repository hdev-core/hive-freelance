import { randomBytes } from "node:crypto";

type ChallengeEntry = {
  challenge: string;
  expiresAt: number;
};

const store = new Map<string, ChallengeEntry>();
const TTL_MS = 60_000;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function createChallenge(username: string): {
  challenge: string;
  expires_in: number;
} {
  const key = normalizeUsername(username);
  const challenge = `hive-freelance:${key}:${randomBytes(16).toString("hex")}`;
  store.set(key, { challenge, expiresAt: Date.now() + TTL_MS });
  return { challenge, expires_in: TTL_MS / 1000 };
}

/** Consume challenge (single-use). Returns true if valid. */
export function consumeChallenge(
  username: string,
  challenge: string,
): boolean {
  const key = normalizeUsername(username);
  const entry = store.get(key);
  if (!entry) return false;
  store.delete(key);
  if (Date.now() > entry.expiresAt) return false;
  return entry.challenge === challenge;
}
