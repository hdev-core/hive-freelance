import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { Logo } from "../components/ui/Logo";
import { GoogleIcon } from "../components/ui/GoogleIcon";

type Role = "client" | "freelancer";

type AuthResponse = {
  ok: boolean;
  user: { id: string; username: string; role: string; authType?: string };
  provisioned?: boolean;
  warning?: string;
  rc_warning?: string | null;
};

type Me = {
  user: { username: string; role: string };
};

function dashboardPathForRole(role: string): string {
  return role === "freelancer" ? "/freelancer/overview" : "/client/overview";
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("client");
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
      void apiFetch<Me>("/api/v1/auth/me")
        .then((r) => navigate(dashboardPathForRole(r.user.role)))
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
      const verified = await apiFetch<AuthResponse>("/api/v1/auth/verify", {
        method: "POST",
        body: JSON.stringify({ username: u, signature, challenge, role }),
      });
      if (verified.rc_warning) {
        sessionStorage.setItem("hf_rc_warning", verified.rc_warning);
        setNotice(verified.rc_warning);
      }
      setStatus("Logged in");
      navigate(dashboardPathForRole(role));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    }
  }

  async function devLogin() {
    setError(null);
    try {
      setStatus("Dev login…");
      await apiFetch<AuthResponse>("/api/v1/auth/dev-keychain-login", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setStatus("Logged in (dev)");
      navigate(dashboardPathForRole(role));
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
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>

        <Card className="flex flex-col gap-5">
          <div>
            <h1 className="text-xl font-bold text-text-primary sm:text-2xl">Sign in</h1>
            <p className="lede mt-1">
              Choose how you&apos;d like to continue. Hive is always the identity
              behind your account.
            </p>
          </div>

          {notice && <p className="notice">{notice}</p>}

          <form className="flex flex-col gap-3" onSubmit={(e) => void keychainLogin(e)}>
            <Input
              label="Hive username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => void devLogin()}>
                Dev sign in (seeded account)
              </Button>
              <Select
                aria-label="Role"
                className="flex-1"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="client">Client</option>
                <option value="freelancer">Freelancer</option>
              </Select>
            </div>
            <Button type="submit" variant="inverse" className="w-full">
              <KeyRound size={18} />
              Sign in with Hive Keychain
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <hr className="flex-1 border-border" />
            <span className="text-xs font-medium text-text-muted">OR</span>
            <hr className="flex-1 border-border" />
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={continueGoogle}>
            <GoogleIcon size={18} />
            Continue with Google
          </Button>

          <div className="flex gap-3 rounded-lg border border-border bg-surface-muted p-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-text-secondary" />
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">New to Hive?</strong> Continue
              with Google and we&apos;ll automatically create a Hive account for
              you, linked to your Google identity — no wallet setup required. You
              can connect Hive Keychain anytime later.
            </p>
          </div>

          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">Status:</strong> {status}
          </p>
          {error && <p className="error">{error}</p>}

          <div className="flex flex-col items-center gap-2 border-t border-border pt-4 text-center text-sm text-text-secondary">
            <p>
              Don&apos;t have Keychain?{" "}
              <a
                href="https://chromewebstore.google.com/detail/hive-keychain/jcacnejopjdphbnjgfaaobbfafkihpep"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-text-primary hover:shadow-elevate"
              >
                Get the extension
              </a>
            </p>
            <p className="text-xs text-text-muted">
              By continuing you agree to HiveWork&apos;s{" "}
              <a href="#" onClick={(event) => event.preventDefault()} className="hover:text-text-primary">
                Terms
              </a>{" "}
              and{" "}
              <a href="#" onClick={(event) => event.preventDefault()} className="hover:text-text-primary">
                Privacy Policy
              </a>
              .
            </p>
            <p>
              <Link to="/jobs" className="font-medium text-text-primary hover:shadow-elevate">
                Browse jobs
              </Link>{" "}
              ·{" "}
              <Link to="/claim" className="font-medium text-text-primary hover:shadow-elevate">
                Claim account
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
