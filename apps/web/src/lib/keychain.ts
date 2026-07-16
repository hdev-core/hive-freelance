/** Hive Keychain Active broadcast helper. */

export type BroadcastOp = [string, Record<string, unknown>];

export function requestKeychainBroadcast(
  username: string,
  operations: BroadcastOp[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.hive_keychain) {
      reject(new Error("Hive Keychain extension not detected"));
      return;
    }
    window.hive_keychain.requestBroadcast(
      username,
      operations,
      "Active",
      (response) => {
        if (response.success) {
          const txId =
            (response.result as string | undefined) ??
            `keychain-${Date.now()}`;
          resolve(String(txId));
        } else {
          reject(new Error(response.message ?? "Broadcast rejected"));
        }
      },
    );
  });
}
