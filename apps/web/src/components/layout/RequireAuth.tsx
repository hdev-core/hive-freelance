import { Navigate, Outlet } from "react-router-dom";
import { useSession, type UserRole } from "../../hooks/useSession";
import { dashboardPathForRole } from "../../lib/dashboardPath";

/**
 * Route guard: redirects to /login when there's no valid session, instead of
 * rendering the page shell and hiding content client-side. Checks the real
 * hf_token cookie via useSession() (GET /api/v1/auth/me), not a client-only
 * flag, so a stale/expired cookie is treated the same as logged-out.
 *
 * Pass `allow` to additionally gate by role — e.g. `allow={["client", "both"]}`
 * on a client-only page. A user whose real role isn't in the list is bounced
 * to their own dashboard instead of the page rendering under the wrong
 * identity. Omit `allow` for auth-only gating (any signed-in role).
 */
export function RequireAuth({ allow }: { allow?: UserRole[] }) {
  const { loading, user } = useSession();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allow && !allow.includes(user.role)) {
    return <Navigate to={dashboardPathForRole(user.role)} replace />;
  }

  return <Outlet />;
}
