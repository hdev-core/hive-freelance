import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";

type AuthResponse = {
  ok: boolean;
  user: { id: string; username: string; role: string; authType?: string };
  provisioned?: boolean;
  warning?: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("demo@example.com");
  const [role, setRole] = useState<"client" | "freelancer" | "both">("both");
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("google") === "1") {
      setNotice(
        params.get("provisioned") === "1"
          ? "Google account provisioned (Hive identity created). You are signed in."
          : "Signed in with Google.",
      );
      void apiFetch<{ user: { username: string } }>("/api/v1/auth/me")
        .then(() => navigate("/jobs"))
        .catch(() => undefined);
    }
  }, [params, navigate]);

  async function keychainLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (!u) {
      setError("Enter a Hive username");
      return;
    }
    if (!window.hive_keychain) {
      setError("Hive Keychain extension not detected");
      return;
    }

    try {
      setStatus("Requesting challenge…");
      const { challenge } = await apiFetch<{ challenge: string }>(
        `/api/v1/auth/challenge?username=${encodeURIComponent(u)}`,
      );

      setStatus("Waiting for Keychain…");
      const signature = await new Promise<string>((resolve, reject) => {
        window.hive_keychain!.requestSignBuffer(
          u,
          challenge,
          "Posting",
          (response) => {
            if (response.success && response.result) resolve(response.result);
            else reject(new Error(response.message ?? "Sign rejected"));
          },
        );
      });

      setStatus("Verifying…");
      await apiFetch<AuthResponse>("/api/v1/auth/verify", {
        method: "POST",
        body: JSON.stringify({ username: u, signature, challenge, role }),
      });
      setStatus("Logged in");
      navigate("/jobs");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    }
  }

  async function devLogin() {
    setError(null);
    try {
      setStatus("Dev login…");
      await apiFetch<AuthResponse>("/api/v1/auth/dev-login", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim() || "demo-client",
          role,
        }),
      });
      setStatus("Logged in (dev)");
      navigate("/jobs");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    }
  }

  async function devGoogle() {
    setError(null);
    try {
      setStatus("Dev Google…");
      const res = await apiFetch<AuthResponse>("/api/v1/auth/dev-google", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setStatus(
        res.provisioned
          ? "Provisioned Google user (custodial Hive account)"
          : "Returning Google user",
      );
      setNotice(
        "Platform is custodying keys for this Google user until you claim the account.",
      );
      navigate("/jobs");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    }
  }

  function continueGoogle() {
    // Full page navigation so OAuth redirect works (and Vite proxies /api)
    window.location.href = "/api/v1/auth/google";
  }

  return (
    <section className="panel">
      <h1>Login</h1>
      <p className="lede">
        Hive Keychain for native users, or Google (provisions a custodial Hive
        account). Use <strong>dev</strong> buttons locally without Keychain /
        Google Console.
      </p>

      {notice && <p className="notice">{notice}</p>}

      <form className="actions" onSubmit={(e) => void keychainLogin(e)}>
        <label>
          Hive username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alice"
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "client" | "freelancer" | "both")
            }
          >
            <option value="both">both</option>
            <option value="client">client</option>
            <option value="freelancer">freelancer</option>
          </select>
        </label>
        <button type="submit">Login with Keychain</button>
        <button type="button" onClick={() => void devLogin()}>
          Dev login
        </button>
      </form>

      <hr className="sep" />

      <div className="actions">
        <label>
          Google email (dev)
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
          />
        </label>
        <button type="button" onClick={() => void devGoogle()}>
          Dev Google
        </button>
        <button type="button" onClick={continueGoogle}>
          Continue with Google
        </button>
      </div>

      <p>
        <strong>Status:</strong> {status}
      </p>
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/jobs">Browse jobs</Link> ·{" "}
        <Link to="/claim">Claim account</Link>
      </p>
    </section>
  );
}
