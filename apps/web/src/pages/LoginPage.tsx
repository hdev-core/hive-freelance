import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

type AuthResponse = {
  ok: boolean;
  user: { id: string; hiveUsername: string; role: string };
  warning?: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"client" | "freelancer" | "both">("both");
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="panel">
      <h1>Login</h1>
      <p className="lede">
        Hive Keychain challenge/response, or use <strong>dev-login</strong>{" "}
        locally without Keychain.
      </p>

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

      <p>
        <strong>Status:</strong> {status}
      </p>
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/jobs">Browse jobs</Link> without logging in (public).
      </p>
    </section>
  );
}
