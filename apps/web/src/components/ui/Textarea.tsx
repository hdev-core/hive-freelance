import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, id, className, rows = 4, ...props }, ref) => {
    const autoId = useId();
    const areaId = id ?? autoId;
    const field = (
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        className={cn(
          "w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-shadow duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-elevate",
          className,
        )}
        {...props}
      />
    );

    if (!label) return field;

    return (
      <label htmlFor={areaId} className="flex flex-col gap-1.5 text-sm font-medium text-text-secondary">
        {label}
        {field}
        {hint && <span className="text-xs font-normal text-text-muted">{hint}</span>}
      </label>
    );
  },
);

Textarea.displayName = "Textarea";
