import { Calendar, MapPin, Star } from "lucide-react";
import { Avatar } from "../ui/Avatar";

export type ClientProfileSummaryProps = {
  name: string;
  rating: number;
  reviewCount: number;
  location: string;
  memberSince: string;
};

export function ClientProfileSummary({
  name,
  rating,
  reviewCount,
  location,
  memberSince,
}: ClientProfileSummaryProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} size="lg" />
        <div>
          <span className="font-semibold text-text-primary">{name}</span>
          {reviewCount > 0 && (
            <div className="flex items-center gap-1 text-sm text-text-secondary">
              <Star size={14} className="fill-accent text-accent" />
              <span>
                {rating.toFixed(1)} ({reviewCount} review{reviewCount === 1 ? "" : "s"})
              </span>
            </div>
          )}
        </div>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-text-secondary">
            <MapPin size={14} className="shrink-0" />
            Location
          </dt>
          <dd className="font-medium text-text-primary">{location}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-text-secondary">
            <Calendar size={14} className="shrink-0" />
            Member since
          </dt>
          <dd className="font-medium text-text-primary">{memberSince}</dd>
        </div>
      </dl>
    </div>
  );
}
