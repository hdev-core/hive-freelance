import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, id, className, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const field = (
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-shadow duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-elevate",
          className,
        )}
        {...props}
      />
    );

    if (!label) return field;

    return (
      <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm font-medium text-text-secondary">
        {label}
        {field}
        {hint && <span className="text-xs font-normal text-text-muted">{hint}</span>}
      </label>
    );
  },
);

Input.displayName = "Input";
