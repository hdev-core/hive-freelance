import { Clock, Users } from "lucide-react";
import { Card, LinkButton } from "../ui";
import { SkillTag } from "./SkillTag";
import { StatusBadge } from "./StatusBadge";
import type { JobListItem } from "../../services/jobDetailService";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import { formatBudget } from "../../lib/formatBudget";

/**
 * Client's own job card for "Your posted jobs" — distinct from JobListCard
 * (the public-browse/read-only card) because it carries owner-only actions,
 * "View job details" and "View proposals". No "Edit job" action: no
 * edit-job page exists yet anywhere in the app (PUT /jobs/:id is wired on
 * the backend, but there is no frontend route for it), so the mockup's edit
 * button was dropped rather than linking somewhere real. Title is plain
 * text, not a link — "View job details" is the one, explicit way to reach
 * the job detail page now, rather than an implicit click-the-title target.
 */
export function ClientJobCard({ job }: { job: JobListItem }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="font-medium">{job.category ?? "General"}</span>
          <StatusBadge status={job.status} />
        </div>
        <div className="text-base font-bold text-success-text">{formatBudget(job.budget)}</div>
      </div>

      <h3 className="text-lg font-semibold text-text-primary">{job.title}</h3>

      <div className="flex flex-wrap gap-2">
        {(job.skills_required ?? []).map((skill) => (
          <SkillTag key={skill} skill={skill} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
          <span className="flex items-center gap-1">
            <Users size={14} />
            {job.proposalCount} proposal{job.proposalCount === 1 ? "" : "s"} received
          </span>
          <span className="flex items-center gap-1">
            <Clock size={14} className="shrink-0" />
            Posted {formatRelativeTime(new Date(job.created_at))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton to={job.id} variant="secondary" size="sm">
            View job details
          </LinkButton>
          <LinkButton to={`${job.id}/proposals`} variant="primary" size="sm">
            View proposals
          </LinkButton>
        </div>
      </div>
    </Card>
  );
}
