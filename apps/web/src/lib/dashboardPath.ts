import type { UserRole } from "../hooks/useSession";

/**
 * Where a signed-in user lands after auth, or where a role-gated route
 * bounces them back to. A "both" user defaults to the client dashboard —
 * matches this app's pre-existing LoginPage behavior. Backend role guards
 * (apps/api/src/middleware/auth.ts requireClient/requireFreelancer) treat
 * "both" as satisfying either gate, not as picking one fixed side, so
 * "both" users can still reach the freelancer dashboard — just not by
 * default landing there.
 */
export function dashboardPathForRole(role: UserRole): string {
  return role === "freelancer" ? "/freelancer/overview" : "/client/overview";
}
