import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  padding?: "none" | "sm" | "md";
};

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, padding = "md", className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl border border-border bg-surface shadow-sm",
          paddingStyles[padding],
          interactive &&
            "cursor-pointer transition-shadow duration-150 hover:border-border-strong hover:shadow-elevate",
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = "Card";
