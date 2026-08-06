import { useEffect, useRef, useState } from "react";
import { ChevronUp, LogOut, Settings, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "../../lib/cn";
import { Avatar } from "../ui/Avatar";
import { apiFetch } from "../../api";
import type { DashboardRole, DashboardUser } from "./types";

export function ProfileMenu({
  role,
  user,
  collapsed = false,
  onNavigate,
}: {
  role: DashboardRole;
  user: DashboardUser;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const base = `/${role}`;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function closeAnd(fn?: () => void) {
    setOpen(false);
    onNavigate?.();
    fn?.();
  }

  async function logout() {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Clear the local session regardless — cookie may already be gone/expired.
    }
    navigate("/");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border-0 bg-transparent p-1.5 text-left font-normal transition-shadow duration-150 hover:bg-surface-muted hover:shadow-elevate",
          collapsed && "justify-center",
        )}
      >
        <Avatar name={user.name} size="sm" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-text-primary">
                {user.name}
              </span>
              <span className="block truncate text-xs text-text-secondary">{user.handle}</span>
            </span>
            {/* Menu opens upward (bottom-full below) — chevron points up
                when closed (hinting content above) and flips to point back
                down at the trigger once open. */}
            <ChevronUp
              size={14}
              className={cn("shrink-0 text-text-muted transition-transform duration-150", open && "rotate-180")}
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-elevate-lg"
        >
          <Link
            to={`${base}/settings`}
            role="menuitem"
            onClick={() => closeAnd()}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-text-secondary transition-shadow duration-150 hover:bg-surface-muted hover:text-text-primary hover:shadow-elevate"
          >
            <Settings size={16} />
            Settings
          </Link>
          <Link
            to={`${base}/profile`}
            role="menuitem"
            onClick={() => closeAnd()}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-text-secondary transition-shadow duration-150 hover:bg-surface-muted hover:text-text-primary hover:shadow-elevate"
          >
            <User size={16} />
            Profile
          </Link>
          <hr className="my-1.5 border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => closeAnd(() => void logout())}
            className="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-[13px] font-medium text-text-secondary transition-shadow duration-150 hover:bg-surface-muted hover:text-text-primary hover:shadow-elevate"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
