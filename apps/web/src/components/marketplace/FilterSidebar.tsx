import { ShieldCheck, SlidersHorizontal } from "lucide-react";
import { cn } from "../../lib/cn";
import { BUDGET_RANGES, type BudgetRangeValue } from "./budgetRanges";

export type FilterSidebarProps = {
  categories: { label: string; count: number }[];
  selectedCategory: string | null;
  onSelectCategory: (label: string | null) => void;
  budgetRange: BudgetRangeValue;
  onSelectBudgetRange: (value: BudgetRangeValue) => void;
  skills: string[];
  selectedSkill: string | null;
  onSelectSkill: (skill: string | null) => void;
  escrowFundedOnly: boolean;
  onToggleEscrowFundedOnly: () => void;
};

/**
 * `category` and `skill` are single-select here to mirror the real GET /jobs
 * contract exactly (`?category=` and `?skill=` each take one value, not an
 * array). `budgetRange` and `escrowFundedOnly` have no query param on the
 * real endpoint at all — the page applies those as a client-side filter over
 * whatever jobsService.listJobs already returned.
 */
export function FilterSidebar({
  categories,
  selectedCategory,
  onSelectCategory,
  budgetRange,
  onSelectBudgetRange,
  skills,
  selectedSkill,
  onSelectSkill,
  escrowFundedOnly,
  onToggleEscrowFundedOnly,
}: FilterSidebarProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={18} className="shrink-0 text-text-primary" />
        <h2 className="text-base font-semibold text-text-primary">Filters</h2>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={16} className="shrink-0 text-text-secondary" />
          <span className="truncate text-sm font-medium text-text-secondary">Escrow funded only</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={escrowFundedOnly}
          onClick={onToggleEscrowFundedOnly}
          style={{ padding: 0 }}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center justify-start rounded-full border-0 p-0 transition-colors duration-150",
            escrowFundedOnly
              ? "bg-accent hover:bg-accent active:bg-accent"
              : "bg-surface-muted hover:bg-surface-muted active:bg-surface-muted",
          )}
        >
          <span
            className={cn(
              "block h-4 w-4 rounded-full bg-surface transition-transform duration-150",
              escrowFundedOnly ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Category</h3>
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <label key={category.label} className="flex flex-row cursor-pointer items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedCategory === category.label}
                  onChange={() => onSelectCategory(selectedCategory === category.label ? null : category.label)}
                  className="h-4 w-4 min-w-0 shrink-0 rounded border-border accent-accent"
                />
                <span className="truncate text-text-primary">{category.label}</span>
              </span>
              <span className="shrink-0 text-text-muted">{category.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Budget</h3>
        <div className="flex flex-col gap-2">
          {BUDGET_RANGES.map((range) => (
            <label key={range.value} className="flex flex-row cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="radio"
                name="budget-range"
                checked={budgetRange === range.value}
                onChange={() => onSelectBudgetRange(range.value)}
                className="h-4 w-4 min-w-0 shrink-0 border-border accent-accent"
              />
              <span className="min-w-0">{range.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Skills</h3>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => {
            const active = selectedSkill === skill;
            return (
              <button
                key={skill}
                type="button"
                onClick={() => onSelectSkill(active ? null : skill)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-shadow duration-150",
                  active
                    ? "border-accent-subtle-border bg-accent-subtle text-text-primary hover:bg-accent-subtle active:bg-accent-subtle"
                    : "border-border bg-surface text-text-secondary hover:border-border-strong hover:bg-surface hover:text-text-secondary hover:shadow-elevate active:bg-surface",
                )}
              >
                {skill}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
