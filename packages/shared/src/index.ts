/** Platform custom_json / filter id — must match Tech Stack & Architecture docs. */
export const APP_ID = "hive-freelance-v1" as const;

export const USER_ROLES = ["client", "freelancer", "both"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const AUTH_TYPES = ["keychain", "google", "claimed"] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

/** Native Hive escrow + app-relevant operation type names. */
export const ESCROW_OP_TYPES = [
  "escrow_transfer",
  "escrow_approve",
  "escrow_release",
  "escrow_dispute",
] as const;

export const TRACKED_OP_TYPES = [
  ...ESCROW_OP_TYPES,
  "custom_json",
  "account_create",
  "delegate_vesting_shares",
] as const;

export type TrackedOpType = (typeof TRACKED_OP_TYPES)[number];

export function isTrackedOpType(value: string): value is TrackedOpType {
  return (TRACKED_OP_TYPES as readonly string[]).includes(value);
}

/**
 * Milestone statuses that mean real money/escrow motion has happened.
 * A contract/job can't be cancelled out from under a milestone in one of
 * these states — used by both cancelContract and cancelJob, so it lives
 * here rather than being duplicated (or one importing from the other).
 */
export const BLOCKING_MILESTONE_STATUSES = [
  "funded",
  "submitted",
  "approved",
  "released",
] as const;