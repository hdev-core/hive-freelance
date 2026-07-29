import { useEffect, useState } from "react";
import { apiFetch } from "../api";

type SessionUser = { id: string; username: string; role: string };

/**
 * Checks the real session cookie via GET /api/v1/auth/me (auth.ts) — this
 * is the actual backend auth endpoint, not a mock. Treats any failure
 * (401 when logged out, or the API being unreachable) as logged-out, which
 * is the safe default for gating actions behind sign-in.
 */
export function useSession(): { loading: boolean; user: SessionUser | null } {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ user: SessionUser }>("/api/v1/auth/me")
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, user };
}
