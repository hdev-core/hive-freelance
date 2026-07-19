import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutGrid,
  MessageSquare,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";
import { IconButton } from "../ui/IconButton";
import { Logo } from "../ui/Logo";
import { ProfileMenu } from "./ProfileMenu";
import type { DashboardRole, DashboardUser } from "./types";

export type { DashboardRole, DashboardUser } from "./types";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { to: "overview", label: "Overview", icon: LayoutGrid },
  { to: "jobs", label: "Jobs", icon: Briefcase },
  { to: "proposals", label: "Proposals", icon: FileText },
  { to: "messages", label: "Messages", icon: MessageSquare },
  { to: "escrow", label: "Escrow & Wallet", icon: Wallet },
];

const defaultUser: DashboardUser = {
  name: "Guest User",
  handle: "@guest.hive",
};

function NavRow({
  to,
  label,
  Icon,
  collapsed,
}: {
  to: string;
  label: string;
  Icon: LucideIcon;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to.endsWith("overview")}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-shadow duration-150",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-accent-subtle text-text-primary font-semibold"
            : "text-text-secondary hover:bg-surface-muted hover:text-text-primary hover:shadow-elevate",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              isActive ? "bg-accent text-text-inverse" : "text-text-secondary",
            )}
          >
            <Icon size={16} />
          </span>
          {!collapsed && label}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({
  role,
  user,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  role: DashboardRole;
  user: DashboardUser;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const base = `/${role}`;

  return (
    <div className="flex h-full flex-col p-3">
      <div
        className={cn(
          "flex pb-3 pt-1",
          collapsed ? "flex-col items-center gap-2" : "items-center justify-between px-1",
        )}
      >
        <Logo size="sm" iconOnly={collapsed} onClick={onNavigate} />
        {onToggleCollapsed && (
          <IconButton
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </IconButton>
        )}
      </div>

      <div className="border-t border-border" />

      {!collapsed && (
        <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {role === "client" ? "Client menu" : "Freelancer menu"}
        </p>
      )}
      {collapsed && <div className="pt-3" />}

      <nav className="flex flex-1 flex-col gap-0.5" onClick={onNavigate} aria-label="Dashboard">
        {navItems.map((item) => (
          <NavRow
            key={item.to}
            to={`${base}/${item.to}`}
            label={item.label}
            Icon={item.icon}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="border-t border-border pt-2">
        <ProfileMenu role={role} user={user} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function DashboardSidebar({
  role,
  user = defaultUser,
  collapsed = false,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}: {
  role: DashboardRole;
  user?: DashboardUser;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden shrink-0 border-r border-border bg-surface transition-[width] duration-200 lg:block",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <SidebarContent role={role} user={user} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-surface shadow-elevate-lg">
            <IconButton
              className="absolute right-3 top-3"
              aria-label="Close menu"
              onClick={onMobileClose}
            >
              <X size={20} />
            </IconButton>
            <SidebarContent role={role} user={user} onNavigate={onMobileClose} />
          </div>
        </div>
      )}
    </>
  );
}
