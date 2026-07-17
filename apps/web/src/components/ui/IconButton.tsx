import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  "aria-label": string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ active, className, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "relative inline-flex h-10 w-10 shrink-0 items-center justify-center gap-0 rounded-full border-0 p-0 font-normal transition-shadow duration-150 disabled:cursor-not-allowed disabled:opacity-50",
          active
            ? "bg-accent-subtle text-text-primary"
            : "bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary hover:shadow-elevate",
          className,
        )}
        {...props}
      />
    );
  },
);

IconButton.displayName = "IconButton";
