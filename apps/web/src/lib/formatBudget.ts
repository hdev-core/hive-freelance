export function formatBudget(budget: string, pricingType: "fixed" | "hourly"): string {
  const amount = Number(budget).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return pricingType === "hourly" ? `${amount} HBD/hr` : `${amount} HBD`;
}
