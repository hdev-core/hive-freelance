import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type TagProps = HTMLAttributes<HTMLSpanElement>;

export function Tag({ className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-accent-subtle-border bg-accent-subtle px-3 py-1 text-xs font-medium text-text-primary",
        className,
      )}
      {...props}
    />
  );
}
