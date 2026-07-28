import { Star, BadgeCheck } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";

export type ClientProfileSummaryProps = {
  name: string;
  rating: number;
  reviewCount: number;
  location: string;
  totalSpent: string;
  memberSince: string;
  verified: boolean;
};

export function ClientProfileSummary({
  name,
  rating,
  reviewCount,
  location,
  totalSpent,
  memberSince,
  verified,
}: ClientProfileSummaryProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} size="lg" />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-text-primary">{name}</span>
            {verified && <BadgeCheck size={16} className="text-accent" aria-label="Verified" />}
          </div>
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
          <dt className="text-text-secondary">Location</dt>
          <dd className="font-medium text-text-primary">{location}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-secondary">Total spent</dt>
          <dd className="font-medium text-text-primary">{totalSpent}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-secondary">Member since</dt>
          <dd className="font-medium text-text-primary">{memberSince}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-secondary">Identity</dt>
          <dd>
            <Badge variant={verified ? "success" : "neutral"}>{verified ? "Verified" : "Unverified"}</Badge>
          </dd>
        </div>
      </dl>
    </div>
  );
}
