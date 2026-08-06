import { Link } from "react-router-dom";
import { Clock, MapPin, Star, Users } from "lucide-react";
import { Card } from "../ui/Card";
import { SkillTag } from "./SkillTag";
import { StatusBadge } from "./StatusBadge";
import type { JobListItem } from "../../services/jobDetailService";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import { formatBudget } from "../../lib/formatBudget";

/**
 * Real-data job card, used by both JobsListPage (public browse) and
 * ClientJobsPage ("your posted jobs"). Replaces the old mock-only JobCard.
 * Rating/location/proposal count are real now (services/jobs.ts#listJobs
 * computes them server-side — a batched review-rating aggregate, not a
 * per-card client-side fetch) — no pricing_type/"Hourly price" label
 * though, since that was never a real field and stays dropped.
 */
export function JobListCard({ job }: { job: JobListItem }) {
  return (
    <Card interactive>
      <Link to={job.id} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="font-medium">{job.category ?? "General"}</span>
            <span aria-hidden>&bull;</span>
            <span className="flex items-center gap-1">
              <Clock size={12} className="shrink-0" />
              {formatRelativeTime(new Date(job.created_at))}
            </span>
          </div>
          <StatusBadge status={job.status} />
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
            {job.client_rating.count > 0 && (
              <span className="flex items-center gap-1">
                <Star size={14} className="fill-accent text-accent" />
                {job.client_rating.average?.toFixed(1)}
              </span>
            )}
            {job.client_location && (
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                {job.client_location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users size={14} />
              {job.proposalCount} proposal{job.proposalCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="text-base font-bold text-success-text">{formatBudget(job.budget)}</div>
        </div>
      </Link>
    </Card>
  );
}
