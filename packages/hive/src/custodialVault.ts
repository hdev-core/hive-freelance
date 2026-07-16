/**
 * In-memory KMS stub registry for per-user custodial keys (Google path).
 * Never logs secret material. Production replaces this with real KMS/HSM.
 */

const vault = new Map<string, { active?: string; owner?: string }>();

export function userActiveKeyRef(hiveUsername: string): string {
  return `local:user:active:${hiveUsername}`;
}

export function userOwnerKeyRef(hiveUsername: string): string {
  return `local:user:owner:${hiveUsername}`;
}

export function putCustodialKeys(
  hiveUsername: string,
  keys: { active?: string; owner?: string },
): { activeRef: string; ownerRef: string } {
  const activeRef = userActiveKeyRef(hiveUsername);
  const ownerRef = userOwnerKeyRef(hiveUsername);
  vault.set(hiveUsername, {
    active: keys.active ?? `stub-active-${hiveUsername}`,
    owner: keys.owner ?? `stub-owner-${hiveUsername}`,
  });
  return { activeRef, ownerRef };
}

export function hasCustodialKey(
  hiveUsername: string,
  which: "active" | "owner",
): boolean {
  const entry = vault.get(hiveUsername);
  return Boolean(entry?.[which]);
}

export function wipeCustodialKeys(hiveUsername: string): void {
  vault.delete(hiveUsername);
}

export function getCustodialPresence(hiveUsername: string): {
  hasActive: boolean;
  hasOwner: boolean;
} {
  const entry = vault.get(hiveUsername);
  return {
    hasActive: Boolean(entry?.active),
    hasOwner: Boolean(entry?.owner),
  };
}
