import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type AvatarSize = "sm" | "md" | "lg";

export type AvatarProps = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  size?: AvatarSize;
};

const sizeStyles: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = "md", className, ...props }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent-subtle font-semibold text-text-primary",
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
