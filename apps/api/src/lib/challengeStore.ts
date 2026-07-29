import { randomBytes } from "node:crypto";

type ChallengeEntry = {
  challenge: string;
  expiresAt: number;
};

const store = new Map<string, ChallengeEntry>();
const TTL_MS = 60_000;
const SWEEP_MS = 5 * 60_000;

// Challenges that are created but never consumed (abandoned logins) would
// otherwise sit in the map forever. Sweep expired entries periodically.
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, SWEEP_MS);
sweepTimer.unref?.();

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
