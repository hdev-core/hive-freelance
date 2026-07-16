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
