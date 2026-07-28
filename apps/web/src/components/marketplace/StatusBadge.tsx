import { CheckCircle2, Clock, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Deliberately does NOT reuse ui/Badge's "accent" variant (solid fill,
 * white text) — per direct design feedback these status pills use the
 * Accent Subtle background with red TEXT + a small status icon instead,
 * matching the marketplace mockups. This is a scoped exception to the
 * "red is fill-only, never text color" chrome rule in Design System
 * Notes §4, confined to marketplace status pills. text-accent on
 * bg-accent-subtle is contrast-checked ~6.8:1 (light) / ~4.8:1 (dark) —
 * passes WCAG AA in both themes.
 */
export type StatusBadgeStatus =
  | "escrow_funded"
  | "awaiting_funding"
  | "active"
  | "suspended"
  | "open"
  | "in_progress"
  | "completed";

const statusConfig: Record<StatusBadgeStatus, { label: string; icon?: LucideIcon; className: string }> = {
  escrow_funded: {
    label: "Escrow Funded",
    icon: ShieldCheck,
    className: "border border-accent-subtle-border bg-accent-subtle text-accent",
  },
  awaiting_funding: {
    label: "Awaiting Funding",
    icon: Clock,
    className: "bg-warning-bg text-warning-text",
  },
  suspended: {
    label: "Suspended",
    icon: ShieldAlert,
    className: "border border-accent-subtle-border bg-accent-subtle text-accent",
  },
  active: {
    label: "Active",
    className: "border border-border bg-surface-muted text-text-secondary",
  },
  open: {
    label: "Open",
    className: "border border-border bg-surface-muted text-text-secondary",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    className: "border border-border bg-surface-muted text-text-secondary",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-success-bg text-success-text",
  },
};

export function StatusBadge({ status }: { status: StatusBadgeStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", config.className)}>
      {Icon && <Icon size={12} className="shrink-0" />}
      {config.label}
    </span>
  );
}
