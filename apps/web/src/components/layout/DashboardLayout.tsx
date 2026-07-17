import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { cn } from "../../lib/cn";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";
import type { DashboardRole, DashboardUser } from "./types";

const COLLAPSE_STORAGE_KEY = "hivework-sidebar-collapsed";

function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
}

export function DashboardLayout({
  role,
  user,
  walletBalance = "0 HBD",
}: {
  role: DashboardRole;
  user?: DashboardUser;
  walletBalance?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readInitialCollapsed);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-canvas">
      <DashboardSidebar
        role={role}
        user={user}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-20" : "lg:pl-64")}>
        <DashboardTopbar onMenuClick={() => setMobileOpen(true)} walletBalance={walletBalance} />
        <main className="mx-auto w-full max-w-canvas px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
