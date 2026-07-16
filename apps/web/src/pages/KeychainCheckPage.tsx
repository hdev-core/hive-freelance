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

export function KeychainCheckPage() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("Idle");
  const [detail, setDetail] = useState<string | null>(null);

  function detectExtension() {
    const installed = KeychainProvider.isExtensionInstalled();
    if (!installed && typeof window.hive_keychain === "undefined") {
      setStatus("Keychain not detected");
      setDetail("Install the Hive Keychain browser extension, then reload.");
      return;
    }
    if (typeof window.hive_keychain !== "undefined") {
      window.hive_keychain.requestHandshake(() => {
        setStatus("Keychain detected");
        setDetail("Handshake succeeded (hive_keychain + WAX signer package).");
      });
      return;
    }
    setStatus("Keychain detected");
    setDetail("KeychainProvider.isExtensionInstalled() returned true.");
  }

  async function smokeSign() {
    if (!username.trim()) {
      setStatus("Enter a Hive username");
      return;
    }

    try {
      const { createHiveChain } = await import("@hiveio/wax");
      await createHiveChain();
      KeychainProvider.for(username.trim(), "posting");
      setStatus("WAX + Keychain provider ready");
      setDetail("Provider created; running sign-buffer smoke test…");
    } catch (err) {
      setStatus("WAX signer setup failed — using hive_keychain API");
      setDetail(err instanceof Error ? err.message : String(err));
    }

    if (typeof window.hive_keychain === "undefined") {
      setStatus("Keychain not detected");
      return;
    }

    const message = `hive-freelance-smoke:${Date.now()}`;
    window.hive_keychain.requestSignBuffer(
      username.trim(),
      message,
      "Posting",
      (response) => {
        if (response.success) {
          setStatus("Sign buffer OK");
          setDetail(response.result ?? "Signed");
        } else {
          setStatus("Sign buffer failed");
          setDetail(response.message ?? "User rejected or error");
        }
      },
    );
  }

  return (
    <section className="panel">
      <h1>Hive Keychain check</h1>
      <p className="lede">
        Verifies browser Keychain presence and optional posting-key sign-buffer
        smoke test via <code>@hiveio/wax-signers-keychain</code>.
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
        <button type="button" onClick={() => void smokeSign()}>
          Sign buffer smoke test
        </button>
      </div>

      <p>
        <strong>Status:</strong> {status}
      </p>
      {detail && <pre className="detail">{detail}</pre>}
    </section>
  );
}
