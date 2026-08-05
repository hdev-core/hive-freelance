import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { cn } from "../../lib/cn";
import { useSession } from "../../hooks/useSession";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";
import type { DashboardRole } from "./types";

const COLLAPSE_STORAGE_KEY = "hivework-sidebar-collapsed";

function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
}

/**
 * `role` is which dashboard tree/URL prefix is rendering (still just
 * "client" | "freelancer" — a presentation choice, set by the route in
 * App.tsx). It is NOT the signed-in user's real role — that comes from
 * useSession() below and can also be "both". Route-level access control
 * (who's allowed under this tree at all) lives in RequireAuth's `allow`
 * prop, one level up — this component assumes that check already passed.
 */
export function DashboardLayout({
  role,
  walletBalance = "0 HBD",
}: {
  role: DashboardRole;
  walletBalance?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readInitialCollapsed);
  const { user: sessionUser } = useSession();

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // No display-name field on the session payload (that lives on the Profile
  // row, a separate fetch) — username doubles as both until/unless the
  // sidebar identity block is worth a dedicated profile fetch.
  const user = sessionUser
    ? { name: sessionUser.username, handle: `@${sessionUser.username}` }
    : undefined;

  return (
    <div className="min-h-screen bg-canvas">
      <DashboardSidebar
        role={role}
        user={user}
        userRole={sessionUser?.role}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-20" : "lg:pl-64")}>
        <DashboardTopbar onMenuClick={() => setMobileOpen(true)} walletBalance={walletBalance} />
        <main className="mx-auto w-full max-w-canvas px-4 py-6 sm:px-6 lg:px-8">
          {/* Which tree is rendering — the same value DashboardSidebar uses
              to build its own links. Routed children (e.g. ProfilePage) that
              need to build an absolute /:role/... link read it via
              useOutletContext() instead of re-deriving it from the URL. */}
          <Outlet context={role} />
        </main>
      </div>
    </div>
  );
}
