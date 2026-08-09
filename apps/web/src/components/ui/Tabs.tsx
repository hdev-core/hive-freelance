import { cn } from "../../lib/cn";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  /** Omit to hide the count suffix (e.g. an "All" tab with no number). */
  count?: number;
};

/**
 * Plain-text underline tabs. Every raw `<button>` in this app inherits a
 * global default style (styles/index.css — solid accent background, white
 * text, padding, rounded corners), meant for buttons that don't otherwise
 * specify a look. A tab list wants none of that, so every one of those
 * properties is explicitly reset below rather than left to fall through —
 * that fallthrough is what previously rendered these as solid red pills.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  bordered = true,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Set false when a sibling element (e.g. a sort control) needs to share
   * one continuous bottom border with this row instead of Tabs drawing its
   * own scoped to just its own width. */
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-nowrap items-center gap-5 overflow-x-auto",
        bordered && "border-b border-border",
      )}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-none border-b-2 border-t-0 bg-transparent px-0 pb-2 pt-0 text-sm transition-colors hover:bg-transparent hover:shadow-none active:bg-transparent",
            value === item.value
              ? "border-accent font-semibold text-text-primary"
              : "border-transparent font-medium text-text-secondary hover:text-text-primary",
          )}
        >
          {item.label}
          {item.count !== undefined && ` ${item.count}`}
        </button>
      ))}
    </div>
  );
}
