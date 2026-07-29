import { Bell, Menu, Search, Wallet } from "lucide-react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { IconButton } from "../ui/IconButton";

export function DashboardTopbar({
  onMenuClick,
  walletBalance,
}: {
  onMenuClick: () => void;
  walletBalance?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <IconButton className="lg:hidden" aria-label="Open menu" onClick={onMenuClick}>
          <Menu size={22} />
        </IconButton>

        <label className="relative hidden max-w-md flex-1 sm:block">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search jobs, contracts, transactions..."
            className="w-full min-w-0 rounded-lg border border-border bg-canvas py-2 pl-10 pr-3 text-sm text-text-primary outline-none transition-shadow duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-elevate"
          />
        </label>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <IconButton aria-label="Notifications">
            <Bell size={20} />
          </IconButton>
          {walletBalance && (
            <span className="inline-flex items-center gap-2 rounded-full bg-success-bg px-3 py-1.5 text-sm font-semibold text-success-text">
              <Wallet size={18} />
              {walletBalance}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
