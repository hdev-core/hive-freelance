export const BUDGET_RANGES = [
  { value: "any", label: "Any budget" },
  { value: "under-1000", label: "Under 1,000 HBD" },
  { value: "1000-3000", label: "1,000 – 3,000 HBD" },
  { value: "3000-5000", label: "3,000 – 5,000 HBD" },
  { value: "5000-plus", label: "5,000+ HBD" },
] as const;

export type BudgetRangeValue = (typeof BUDGET_RANGES)[number]["value"];
