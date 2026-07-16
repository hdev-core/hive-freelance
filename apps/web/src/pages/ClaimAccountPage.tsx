import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

type Me = {
  user: {
    id: string;
    username: string;
    role: string;
    authType: string | null;
    custodial: boolean;
  };
};

export function ClaimAccountPage() {
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [owner, setOwner] = useState("");
  const [active, setActive] = useState("");
  const [posting, setPosting] = useState("");
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Me>("/api/v1/auth/me")
      .then((r) => setMe(r.user))
      .catch(() => setMe(null));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      setStatus("Claiming…");
      const res = await apiFetch<{
        message: string;
        dryRun: boolean;
        username: string;
      }>("/api/v1/auth/me/claim-account", {
        method: "POST",
        body: JSON.stringify({
          owner_key: owner,
          active_key: active,
          posting_key: posting,
          memo_key: memo,
        }),
      });
      setMessage(res.message + (res.dryRun ? " (dry-run)" : ""));
      setStatus("Done");
      const refreshed = await apiFetch<Me>("/api/v1/auth/me");
      setMe(refreshed.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    }
  }

  return (
    <section className="panel">
      <h1>Claim my account</h1>
      <p className="lede">
        Google-provisioned accounts are custodial until you rotate keys to your
        own. After claim, install Hive Keychain — the platform cannot sign for
        you anymore.
      </p>

      {!me && (
        <p className="error">
          Not signed in. <Link to="/login">Login</Link> first (use Dev Google).
        </p>
      )}

      {me && (
        <p>
          Signed in as <code>@{me.username}</code> · auth_type={" "}
          <code>{me.authType}</code>
          {me.custodial ? " · custodial" : ""}
        </p>
      )}

      <form className="claim-form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Owner public key
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </label>
        <label>
          Active public key
          <input value={active} onChange={(e) => setActive(e.target.value)} />
        </label>
        <label>
          Posting public key
          <input value={posting} onChange={(e) => setPosting(e.target.value)} />
        </label>
        <label>
          Memo public key
          <input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <button type="submit" disabled={!me || me.authType !== "google"}>
          Claim account
        </button>
      </form>

      <p>
        <strong>Status:</strong> {status}
      </p>
      {message && <p className="notice">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
