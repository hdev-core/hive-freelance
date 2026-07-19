import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { LinkButton } from "../ui/LinkButton";
import { ThemeToggle } from "../ui/ThemeToggle";
import { IconButton } from "../ui/IconButton";
import { Logo } from "../ui/Logo";
import { cn } from "../../lib/cn";

const navLinks = [
  { to: "/jobs", label: "Find Work" },
  { to: "/for-clients", label: "For Clients" },
  { to: "/for-freelancers", label: "For Freelancers" },
  { to: "/messages", label: "Messages" },
];

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-shadow duration-150 hover:bg-surface-muted hover:shadow-elevate",
    isActive ? "bg-accent-subtle text-text-primary" : "text-text-secondary hover:text-text-primary",
  );
}

export function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-canvas items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Logo size="md" />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={navLinkClassName}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Link
            to="/login"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition-shadow duration-150 hover:bg-surface-muted hover:text-text-primary hover:shadow-elevate"
          >
            Sign in
          </Link>
          <LinkButton to="/wallet/connect" size="sm">
            Connect Hive Wallet
          </LinkButton>
        </div>

        <IconButton
          className="md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </IconButton>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-surface px-4 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 pt-3" aria-label="Primary mobile">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={navLinkClassName}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-medium text-text-secondary">Appearance</span>
              <ThemeToggle />
            </div>
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary"
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
            <LinkButton to="/wallet/connect" onClick={() => setMobileOpen(false)}>
              Connect Hive Wallet
            </LinkButton>
          </div>
        </div>
      )}
    </header>
  );
}
