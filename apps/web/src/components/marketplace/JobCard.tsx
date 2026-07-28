import { Star, MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { SkillTag } from "./SkillTag";
import { StatusBadge, type StatusBadgeStatus } from "./StatusBadge";
import type { MockJob } from "../../services/jobsService";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import { formatBudget } from "../../lib/formatBudget";

export function JobCard({ job }: { job: MockJob }) {
  return (
    <Card interactive>
      <Link to={job.id} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="font-medium">{job.category ?? "General"}</span>
            <span aria-hidden>&bull;</span>
            <span>{formatRelativeTime(new Date(job.created_at))}</span>
          </div>
          <StatusBadge status={job.mock.funding_status as StatusBadgeStatus} />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-text-primary">{job.title}</h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">{job.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(job.skills_required ?? []).map((skill) => (
            <SkillTag key={skill} skill={skill} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-4 text-sm text-text-secondary">
            <span className="flex items-center gap-1">
              <Star size={14} className="fill-accent text-accent" />
              {job.mock.client.rating.toFixed(1)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={14} />
              {job.mock.client.location}
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} />
              {job.mock.proposal_count} proposals
            </span>
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-text-primary">{formatBudget(job.budget, job.mock.pricing_type)}</div>
            <div className="text-xs text-text-muted">{job.mock.pricing_type === "hourly" ? "Hourly price" : "Fixed price"}</div>
          </div>
        </div>
      </Link>
    </Card>
  );
}
