import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { Card, Badge } from "../components/ui";
import { SkillTag, JobDetailSidebar, StatusBadge } from "../components/marketplace";
import { getJob } from "../services/jobsService";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { formatBudget } from "../lib/formatBudget";

type JobDetail = Awaited<ReturnType<typeof getJob>>;

function JobDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22.5rem]">
      <Card className="animate-pulse">
        <div className="h-4 w-32 rounded bg-surface-muted" />
        <div className="mt-4 h-7 w-3/4 rounded bg-surface-muted" />
        <div className="mt-6 h-4 w-full rounded bg-surface-muted" />
        <div className="mt-2 h-4 w-5/6 rounded bg-surface-muted" />
      </Card>
      <Card className="h-64 animate-pulse" />
    </div>
  );
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getJob(id)
      .then((data) => {
        if (!cancelled) setJob(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load job");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-4">
      <Link
        to=".."
        relative="path"
        className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        Back to jobs
      </Link>

      {loading && <JobDetailSkeleton />}

      {!loading && error && (
        <div className="rounded-2xl border border-accent-subtle-border bg-accent-subtle p-6 text-sm text-text-primary">
          Couldn't load this job: {error}
        </div>
      )}

      {!loading && !error && job && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22.5rem]">
          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Badge variant="neutral">{job.category ?? "General"}</Badge>
                  <span>{formatRelativeTime(new Date(job.created_at))}</span>
                </div>
                <StatusBadge status={job.mock.funding_status} />
              </div>

              <h1 className="text-2xl font-bold text-text-primary">{job.title}</h1>

              <div className="grid grid-cols-3 gap-4 border-y border-border py-4 text-sm">
                <div>
                  <p className="text-text-secondary">Budget</p>
                  <p className="mt-1 font-bold text-text-primary">{formatBudget(job.budget, job.mock.pricing_type)}</p>
                </div>
                <div>
                  <p className="text-text-secondary">Type</p>
                  <p className="mt-1 font-bold text-text-primary">{job.mock.pricing_type === "hourly" ? "Hourly" : "Fixed"}</p>
                </div>
                <div>
                  <p className="text-text-secondary">Proposals</p>
                  <p className="mt-1 font-bold text-text-primary">{job.proposalCount}</p>
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-base font-semibold text-text-primary">Project description</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">{job.description}</p>
              </div>

              <div>
                <h2 className="mb-2 text-base font-semibold text-text-primary">Skills required</h2>
                <div className="flex flex-wrap gap-2">
                  {(job.skills_required ?? []).map((skill) => (
                    <SkillTag key={skill} skill={skill} />
                  ))}
                </div>
              </div>
            </Card>

            {job.mock.funding_status === "escrow_funded" && (
              <Card className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
                    <ShieldCheck size={16} />
                  </span>
                  <h2 className="text-base font-semibold text-text-primary">Blockchain escrow summary</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-surface-muted p-4">
                    <p className="text-xs text-text-secondary">Escrow status</p>
                    <p className="mt-1 flex items-center gap-1.5 font-semibold text-success-text">
                      <CheckCircle2 size={14} className="shrink-0" />
                      Fully funded
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-muted p-4">
                    <p className="text-xs text-text-secondary">Network</p>
                    <p className="mt-1 font-semibold text-text-primary">Hive Mainnet</p>
                  </div>
                </div>
                <p className="rounded-lg bg-accent-subtle p-3 text-xs text-accent">
                  Once funded, the escrow amount is locked on-chain via native Hive escrow and cannot be changed by either
                  party. Funds release only when milestones are approved.
                </p>
              </Card>
            )}
          </div>

          <JobDetailSidebar job={job} />
        </div>
      )}
    </div>
  );
}
