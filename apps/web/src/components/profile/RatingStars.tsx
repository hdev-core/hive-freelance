import { Star } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Red accent fill, not the amber/gold usually used for star ratings —
 * tokens.css reserves every non-neutral chrome hue for the red accent, and
 * the existing rating precedent (ClientProfileSummary) already fills stars
 * with `fill-accent text-accent` rather than gold. Keeping that here for
 * consistency instead of introducing a second "rating gold" hue.
 */
function StarIcon({ fraction, size }: { fraction: number; size: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Star size={size} className="absolute inset-0 text-border-strong" />
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${fraction * 100}%` }}>
        <Star size={size} className="fill-accent text-accent" />
      </span>
    </span>
  );
}

export function RatingStars({
  value,
  size = 16,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} fraction={Math.max(0, Math.min(1, clamped - i))} size={size} />
      ))}
    </span>
  );
}
