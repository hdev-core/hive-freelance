/**
 * KMS signing interface.
 *
 * Production: store agent + custodial Google-user active keys in KMS/HSM.
 * Local/dev: env-backed stub (LOCAL_AGENT_ACTIVE_KEY / per-ref map). Never commit real keys.
 */

export type SignOperation = Record<string, unknown>;

export type KmsSigner = {
  mode: "local" | "kms";
  /** Resolve a secret material reference (does not log the key). */
  hasKey: (keyRef: string) => Promise<boolean>;
  /**
   * Sign and broadcast path for server-side ops (agent escrow_approve, provisioner).
   * Local stub refuses to broadcast unless PROVISIONER_LIVE / explicit live flags are set
   * by the caller; it only validates that a key ref exists.
   */
  signWithKms: (
    account: string,
    keyRef: string,
    ops: SignOperation[],
  ) => Promise<{ dryRun: boolean; account: string; opCount: number }>;
};

function localKeyMap(): Map<string, string> {
  const map = new Map<string, string>();
  const agent = process.env.LOCAL_AGENT_ACTIVE_KEY;
  const agentAccount = process.env.AGENT_ACCOUNT ?? "hive-freelance-agent";
  if (agent) {
    map.set(`local:agent:${agentAccount}`, agent);
  }
  const creator = process.env.LOCAL_CREATOR_ACTIVE_KEY;
  const creatorAccount = process.env.PROVISIONER_CREATOR_ACCOUNT;
  if (creator && creatorAccount) {
    map.set(`local:creator:${creatorAccount}`, creator);
  }
  return map;
}

export function createKmsSigner(
  mode = (process.env.KMS_MODE as "local" | "kms") ?? "local",
): KmsSigner {
  if (mode === "kms") {
    return {
      mode: "kms",
      async hasKey() {
        throw new Error(
          "Production KMS backend is not wired yet — set KMS_MODE=local for development",
        );
      },
      async signWithKms() {
        throw new Error(
          "Production KMS backend is not wired yet — set KMS_MODE=local for development",
        );
      },
    };
  }

  const keys = localKeyMap();

  return {
    mode: "local",
    async hasKey(keyRef: string) {
      return keys.has(keyRef);
    },
    async signWithKms(account, keyRef, ops) {
      if (!keys.has(keyRef)) {
        throw new Error(
          `Local KMS stub: missing key for ref ${keyRef}. Set LOCAL_*_ACTIVE_KEY in .env for live signing.`,
        );
      }
      // Never return or log private key material.
      return {
        dryRun: true,
        account,
        opCount: ops.length,
      };
    },
  };
}

export function agentKeyRef(account = process.env.AGENT_ACCOUNT): string {
  return `local:agent:${account ?? "hive-freelance-agent"}`;
}

export function creatorKeyRef(
  account = process.env.PROVISIONER_CREATOR_ACCOUNT,
): string {
  if (!account) {
    throw new Error("PROVISIONER_CREATOR_ACCOUNT is not set");
  }
  return `local:creator:${account}`;
}
