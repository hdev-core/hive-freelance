import { cn, type ClassValue } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost" | "inverse" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold border-0 transition-shadow duration-150 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-text-inverse hover:bg-accent-hover hover:shadow-elevate active:bg-accent-pressed",
  secondary:
    "bg-surface-muted text-text-primary border border-border hover:bg-surface-muted hover:shadow-elevate hover:border-border-strong active:bg-surface",
  destructive:
    "bg-transparent text-text-primary border border-accent hover:bg-accent-subtle hover:shadow-elevate active:bg-accent-subtle-border",
  ghost:
    "bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary hover:shadow-elevate",
  /** High-contrast button that auto-inverts with theme (near-black on light, near-white on dark). */
  inverse:
    "bg-text-primary text-canvas hover:bg-text-primary hover:opacity-90 hover:shadow-elevate active:bg-text-primary active:opacity-80",
  /** Bordered, surface-colored button — e.g. third-party auth actions (Continue with Google). */
  outline:
    "bg-surface text-text-primary border border-border hover:bg-surface-muted hover:border-border-strong hover:shadow-elevate active:bg-surface-muted",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function buttonVariants(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  ...extra: ClassValue[]
): string {
  return cn(base, variantStyles[variant], sizeStyles[size], ...extra);
}
