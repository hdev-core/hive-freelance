import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * Status/state indicator. `accent` and `neutral` are chrome-safe (black/
 * grey/red). `success` and `warning` draw from the separate semantic status
 * palette and must only be used for state indicators like this — never for
 * general chrome. `accent` is always a solid red fill with inverse text;
 * red is never used as text color (see Design System Notes).
 */
export type BadgeVariant = "accent" | "neutral" | "success" | "warning";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantStyles: Record<BadgeVariant, string> = {
  accent: "bg-accent text-text-inverse",
  neutral: "bg-surface-muted text-text-secondary border border-border",
  success: "bg-success-bg text-success-text",
  warning: "bg-warning-bg text-warning-text",
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
