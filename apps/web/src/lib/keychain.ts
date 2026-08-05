/** Hive Keychain broadcast helper. */

export type BroadcastOp = [string, Record<string, unknown>];

/**
 * Extracts the real transaction id from Keychain's broadcast result.
 * `response.result` is the broadcast result from the Hive node — an object
 * (e.g. `{ id, block_num, trx_num, ... }`), not a bare string. Some
 * Keychain/node versions have used `tx_id` instead of `id`. Handles a
 * plain-string result too, in case that ever comes back directly.
 */
function extractTxId(result: unknown): string | null {
  if (typeof result === "string" && result.length > 0) return result;
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (typeof obj.id === "string" && obj.id.length > 0) return obj.id;
    if (typeof obj.tx_id === "string" && obj.tx_id.length > 0) return obj.tx_id;
  }
  return null;
}

export function requestKeychainBroadcast(
  username: string,
  operations: BroadcastOp[],
  keyType: "Active" | "Posting" = "Active",
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.hive_keychain) {
      reject(new Error("Hive Keychain extension not detected"));
      return;
    }
    window.hive_keychain.requestBroadcast(
      username,
      operations,
      keyType,
      (response) => {
        if (response.success) {
          const txId = extractTxId(response.result);
          if (!txId) {
            // Don't silently invent a placeholder id here — that's what
            // let a bad value through before. A broadcast we can't get a
            // real transaction id for needs to surface as a failure, not
            // a fake success.
            reject(
              new Error(
                "Broadcast succeeded but no transaction id was found in the response",
              ),
            );
            return;
          }
          resolve(txId);
        } else {
          reject(new Error(response.message ?? "Broadcast rejected"));
        }
      },
    );
  });
}