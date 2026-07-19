import type { LucideIcon } from "lucide-react";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";

/**
 * Milestone 1 placeholder: renders just enough for a route to exist and be
 * navigable. Real page implementation lands in a later milestone.
 */
export function PlaceholderPage({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="flex flex-col items-start gap-4 py-12 text-left sm:items-center sm:py-16 sm:text-center">
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-text-primary">
          <Icon size={22} />
        </span>
      )}
      <div>
        <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{title}</h1>
        <p className="mt-2 max-w-md text-sm text-text-secondary sm:mx-auto">{description}</p>
      </div>
      <Badge variant="neutral">Coming in a later milestone</Badge>
    </Card>
  );
}
