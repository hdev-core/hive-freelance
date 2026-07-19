import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, id, className, children, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    const field = (
      <select
        ref={ref}
        id={selectId}
        className={cn(
          "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-shadow duration-150 focus:border-accent focus:shadow-elevate",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );

    if (!label) return field;

    return (
      <label htmlFor={selectId} className="flex flex-col gap-1.5 text-sm font-medium text-text-secondary">
        {label}
        {field}
        {hint && <span className="text-xs font-normal text-text-muted">{hint}</span>}
      </label>
    );
  },
);

Select.displayName = "Select";
