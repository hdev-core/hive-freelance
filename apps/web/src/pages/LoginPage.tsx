import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Circle, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { GoogleIcon } from "../components/ui/GoogleIcon";
import { useToast } from "../components/ui/ToastProvider";
import { dashboardPathForRole } from "../lib/dashboardPath";
import type { UserRole } from "../hooks/useSession";

type Role = "client" | "freelancer";

type AuthResponse = {
  ok: boolean;
  user: { id: string; username: string; role: UserRole; authType?: string };
  provisioned?: boolean;
  warning?: string;
  rc_warning?: string | null;
};

type Me = {
  user: { username: string; role: UserRole };
};

/** Strip @ / spaces; lowercase — matches API normalizeHiveUsername. */
function normalizeHiveUsername(username: string): string {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

function isValidHiveUsernameClient(username: string): boolean {
  const name = normalizeHiveUsername(username);
  if (!name) return false;
  const segment = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  return name.split(".").every((part) => {
    if (part.length < 3 || part.length > 16) return false;
    return segment.test(part);
  });
}

function googleErrorMessage(code: string): string {
  switch (code) {
    case "access_denied":
      return "Google sign-in was cancelled.";
    case "not_configured":
      return "Google sign-in isn't set up on this server yet.";
    case "missing_code":
    case "callback_failed":
      return "Google sign-in didn't complete. Please try again.";
    default:
      return "Google sign-in failed. Please try again.";
  }
}

/** Fixed-dark brand rail — independent of the app's light/dark theme toggle. */
function MarketingPanel() {
  return (
    <div className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-[#0a0d12] px-12 py-10 text-[#f5f5f7] lg:flex xl:w-[42%]">
      <Link to="/" className="flex w-fit items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ff3d5a]/10 ring-1 ring-[#ff3d5a]/20">
          <img src="/hivework-logo-dark.png" alt="" width={28} height={28} className="object-contain" />
        </span>
        <span className="text-lg font-bold tracking-tight">
          Hive<span className="text-[#ff3d5a]">Work</span>
        </span>
      </Link>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-balance text-4xl font-bold leading-[1.15] text-[#f5f5f7]">
            Freelance work with payments you can actually trust.
          </h1>
          <p className="max-w-md text-[#9aa1ac]">
            Your identity and payouts live on the Hive blockchain. Sign in
            once and every escrow, milestone, and release is tied to your
            on-chain account.
          </p>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Lock size={15} />
              On-Chain Escrow
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90">
              Active
            </span>
          </div>

          <div className="mt-4 rounded-xl bg-white/[0.06] p-4">
            <p className="text-xs text-[#9aa1ac]">Locked in escrow</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              6,500 <span className="text-base font-semibold text-[#9aa1ac]">HBD</span>
            </p>
          </div>

          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            <li className="flex items-center gap-2 text-[#f5f5f7]">
              <CheckCircle2 size={16} className="shrink-0 text-[#ff3d5a]" />
              Milestone 1 — Scoping
            </li>
            <li className="flex items-center gap-2 text-[#9aa1ac]">
              <Circle size={16} className="shrink-0" />
              Milestone 2 — Core delivery
            </li>
          </ul>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-[#9aa1ac]">
        <ShieldCheck size={16} />
        Secured by Hive blockchain escrow
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { showToast } = useToast();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("client");
  const [status, setStatus] = useState("Idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [googleReturnFailed, setGoogleReturnFailed] = useState(false);
  const handledGoogleReturn = useRef(false);

  // We've just been redirected back from Google — the cookie is already set,
  // we're just confirming and routing to the dashboard. Render a loading
  // state instead of the full sign-in form so it never flashes on screen.
  const isCompletingGoogleLogin =
    params.get("google") === "1" && !googleReturnFailed;

  useEffect(() => {
    const googleError = params.get("google_error");
    if (googleError) {
      showToast(googleErrorMessage(googleError), "error");
      navigate("/login", { replace: true });
      return;
    }
    if (params.get("google") !== "1") return;
    // Guards against React StrictMode's dev-only double-invoke, which was
    // firing this fetch (and the success toast) twice per real login.
    if (handledGoogleReturn.current) return;
    handledGoogleReturn.current = true;
    void apiFetch<Me>("/api/v1/auth/me")
      .then((r) => {
        showToast(
          params.get("provisioned") === "1"
            ? "Google account created — signed in"
            : "Signed in with Google",
        );
        navigate(dashboardPathForRole(r.user.role));
      })
      .catch(() => {
        showToast("Google sign-in didn't complete. Please try again.", "error");
        setGoogleReturnFailed(true);
      });
  }, [params, navigate, showToast]);

  async function keychainLogin(e: FormEvent) {
    e.preventDefault();
    const u = normalizeHiveUsername(username);
    if (!u) {
      showToast("Enter a Hive username", "error");
      return;
    }
    if (!isValidHiveUsernameClient(u)) {
      showToast(
        "Use a valid Hive username: 3–16 letters/numbers per part, hyphens ok. No @ or underscores.",
        "error",
      );
      return;
    }
    if (!window.hive_keychain) {
      showToast("Hive Keychain extension not detected", "error");
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
        showToast(verified.rc_warning, "error");
      }
      setStatus("Logged in");
      showToast("Signed in successfully");
      navigate(dashboardPathForRole(role));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
      setStatus("Failed");
    }
  }

  async function devLogin() {
    try {
      setStatus("Dev login…");
      await apiFetch<AuthResponse>("/api/v1/auth/dev-keychain-login", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setStatus("Logged in (dev)");
      showToast("Signed in successfully");
      navigate(dashboardPathForRole(role));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
      setStatus("Failed");
    }
  }

  function continueGoogle() {
    // Full page navigation so OAuth redirect works (and Vite proxies /api)
    window.location.href = "/api/v1/auth/google";
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <MarketingPanel />

      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          {isCompletingGoogleLogin ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-text-secondary">Signing you in…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-xl font-bold text-text-primary sm:text-2xl">
                  Sign in to HiveWork
                </h1>
                <p className="lede mt-1">
                  Choose how you&apos;d like to continue. Hive is always the
                  identity behind your account.
                </p>
              </div>

              {notice && <p className="notice">{notice}</p>}

              <form className="flex flex-col gap-3" onSubmit={(e) => void keychainLogin(e)}>
                <Input
                  label="Hive username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="alice (no @)"
                  autoComplete="username"
                />
                <Select
                  label="I'm signing in as"
                  aria-label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="client">Client</option>
                  <option value="freelancer">Freelancer</option>
                </Select>
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

              <div className="flex items-center justify-between text-sm text-text-secondary">
                <p>
                  <strong className="text-text-primary">Status:</strong> {status}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="!px-2 !py-1 text-xs underline-offset-2 hover:underline"
                  onClick={() => void devLogin()}
                >
                  Dev sign in (seeded account)
                </Button>
              </div>

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
