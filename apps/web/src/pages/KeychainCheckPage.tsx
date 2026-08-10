import { useState } from "react";
import KeychainProvider from "@hiveio/wax-signers-keychain";

declare global {
  interface Window {
    hive_keychain?: {
      requestHandshake: (cb: () => void) => void;
      requestSignBuffer: (
        account: string,
        message: string,
        keyType: string,
        cb: (response: {
          success: boolean;
          result?: string;
          message?: string;
        }) => void,
      ) => void;
      requestBroadcast: (
        username: string,
        operations: [string, Record<string, unknown>][],
        keyType: string,
        cb: (response: {
          success: boolean;
          result?: string;
          message?: string;
        }) => void,
      ) => void;
    };
  }
}

/**
 * Smoke page for Milestone 1 Phase B.
 * Login challenge round-trip uses raw `hive_keychain.requestSignBuffer` (see LoginPage).
 * This page reports WAX package/init and raw Keychain sign separately so status never
 * claims WAX signed the buffer when only raw Keychain did.
 */
export function KeychainCheckPage() {
  const [username, setUsername] = useState("");
  const [waxStatus, setWaxStatus] = useState("Idle");
  const [keychainStatus, setKeychainStatus] = useState("Idle");
  const [detail, setDetail] = useState<string | null>(null);

  function detectExtension() {
    setDetail(null);
    const installed = KeychainProvider.isExtensionInstalled();
    if (!installed && typeof window.hive_keychain === "undefined") {
      setKeychainStatus("Keychain not detected");
      setDetail(
        "Install the Hive Keychain browser extension, then reload this page.",
      );
      return;
    }
    if (typeof window.hive_keychain !== "undefined") {
      window.hive_keychain.requestHandshake(() => {
        setKeychainStatus("Keychain detected (handshake OK)");
        setDetail(
          installed
            ? "hive_keychain handshake succeeded; WAX KeychainProvider reports extension installed."
            : "hive_keychain handshake succeeded.",
        );
      });
      return;
    }
    setKeychainStatus("Keychain detected (WAX isExtensionInstalled)");
    setDetail(
      "KeychainProvider.isExtensionInstalled() returned true, but window.hive_keychain is missing — reload or reinstall the extension.",
    );
  }

  async function checkWaxInit() {
    setDetail(null);
    if (!username.trim()) {
      setWaxStatus("Enter a Hive username first");
      return;
    }
    try {
      const { createHiveChain } = await import("@hiveio/wax");
      await createHiveChain();
      KeychainProvider.for(username.trim(), "posting");
      setWaxStatus("WAX init + KeychainProvider.for OK");
      setDetail(
        "WAX createHiveChain succeeded and KeychainProvider.for was created. This does not sign a buffer — use “Raw Keychain signBuffer smoke” for signing (same path as /login).",
      );
    } catch (err) {
      setWaxStatus("WAX init failed");
      setDetail(err instanceof Error ? err.message : String(err));
    }
  }

  function smokeRawSignBuffer() {
    setDetail(null);
    const u = username.trim();
    if (!u) {
      setKeychainStatus("Enter a Hive username");
      return;
    }
    if (typeof window.hive_keychain === "undefined") {
      setKeychainStatus("Keychain not detected");
      setDetail(
        "Cannot run signBuffer smoke without the Hive Keychain extension.",
      );
      return;
    }

    const message = `hive-freelance-smoke:${Date.now()}`;
    setKeychainStatus("Waiting for Keychain…");
    window.hive_keychain.requestSignBuffer(u, message, "Posting", (response) => {
      if (response.success) {
        setKeychainStatus("Raw Keychain signBuffer OK");
        setDetail(
          `Signed with window.hive_keychain (not WAX provider).\nmessage=${message}\nresult=${response.result ?? "(empty)"}`,
        );
      } else {
        setKeychainStatus("Raw Keychain signBuffer failed");
        setDetail(
          response.message ??
            "User rejected the request or Keychain returned an error.",
        );
      }
    });
  }

  return (
    <section className="panel">
      <h1>Hive Keychain check</h1>
      <p className="lede">
        Milestone 1 smoke: detect Keychain, check WAX package init, and run a{" "}
        <strong>raw</strong> <code>hive_keychain.requestSignBuffer</code> test
        (same signing API <code>/login</code> uses for the challenge round-trip).
        WAX status and Keychain sign status are reported separately on purpose.
      </p>

      <div className="actions">
        <button type="button" onClick={detectExtension}>
          Detect Keychain
        </button>
        <label>
          Hive username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alice"
          />
        </label>
        <button type="button" onClick={() => void checkWaxInit()}>
          Check WAX init
        </button>
        <button type="button" onClick={smokeRawSignBuffer}>
          Raw Keychain signBuffer smoke
        </button>
      </div>

      <p>
        <strong>WAX status:</strong> {waxStatus}
      </p>
      <p>
        <strong>Keychain status:</strong> {keychainStatus}
      </p>
      {detail && <pre className="detail">{detail}</pre>}
    </section>
  );
}
