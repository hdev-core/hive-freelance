export function formatBudget(budget: string): string {
  return `${Number(budget).toLocaleString("en-US", { maximumFractionDigits: 0 })} HBD`;
}
