import { useEffect, useMemo, useState } from "react";
import { Briefcase, CheckCircle2, CircleDot, Clock, XCircle, type LucideIcon } from "lucide-react";
import { PageHeader, Card, LinkButton, Tabs, type TabItem } from "../components/ui";
import { ClientJobCard } from "../components/marketplace";
import { listMyJobs, type JobListItem, type JobStatus } from "../services/jobDetailService";
import { useSession } from "../hooks/useSession";

type TabValue = "all" | JobStatus;

// Same icon-per-status set as StatusBadge, plus a distinct color per status
// so the four tiles read apart from each other at a glance.
const summaryTiles: { status: JobStatus; label: string; icon: LucideIcon; chipClassName: string }[] = [
  { status: "open", label: "Open", icon: CircleDot, chipClassName: "bg-accent-subtle text-accent" },
  { status: "in_progress", label: "In Progress", icon: Clock, chipClassName: "bg-warning-bg text-warning-text" },
  { status: "completed", label: "Completed", icon: CheckCircle2, chipClassName: "bg-success-bg text-success-text" },
  { status: "cancelled", label: "Cancelled", icon: XCircle, chipClassName: "bg-surface-muted text-text-muted" },
];

function ClientJobCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="h-3 w-24 rounded bg-surface-muted" />
      <div className="mt-4 h-5 w-3/4 rounded bg-surface-muted" />
      <div className="mt-3 h-3 w-full rounded bg-surface-muted" />
    </Card>
  );
}

export function ClientJobsPage() {
  const { loading: sessionLoading, user } = useSession();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>("all");

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMyJobs(user.id)
      .then((res) => {
        if (!cancelled) setJobs(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load your jobs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, user]);

  // Client-side counts, same approach as JobDetailSidebar/ClientJobCard —
  // there's no precomputed status-breakdown field on the Jobs API, and
  // jobs.length is always small enough (one client's own postings) that
  // counting on every render is fine.
  const counts = useMemo(() => {
    const byStatus = new Map<JobStatus, number>();
    for (const job of jobs) byStatus.set(job.status, (byStatus.get(job.status) ?? 0) + 1);
    return byStatus;
  }, [jobs]);

  const tabItems: TabItem<TabValue>[] = [
    { value: "all", label: "All", count: jobs.length },
    ...summaryTiles.map((tile) => ({
      value: tile.status as TabValue,
      label: tile.label,
      count: counts.get(tile.status) ?? 0,
    })),
  ];

  const visibleJobs = useMemo(
    () => (tab === "all" ? jobs : jobs.filter((j) => j.status === tab)),
    [jobs, tab],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Your posted jobs"
        subtitle="Create and manage the jobs you've posted."
        actions={
          <LinkButton to="new" variant="primary">
            Post a Job
          </LinkButton>
        }
      />

      {!sessionLoading && !loading && !error && jobs.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summaryTiles.map((tile) => (
            <Card key={tile.status} padding="sm" className="flex items-center gap-2.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tile.chipClassName}`}>
                <tile.icon size={14} />
              </span>
              <div>
                <p className="text-2xl font-bold text-text-primary">{counts.get(tile.status) ?? 0}</p>
                <p className="text-sm text-text-secondary">{tile.label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-accent-subtle-border bg-accent-subtle p-6 text-sm text-text-primary">
          Couldn't load your jobs: {error}
        </div>
      )}

      {(sessionLoading || loading) && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <ClientJobCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!sessionLoading && !loading && !error && jobs.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-text-primary">
            <Briefcase size={22} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">No jobs posted yet</h2>
            <p className="mt-1 text-sm text-text-secondary">Make your first post to start receiving proposals from freelancers.</p>
          </div>
          <LinkButton to="new" variant="primary">
            Post a Job
          </LinkButton>
        </Card>
      )}

      {!sessionLoading && !loading && !error && jobs.length > 0 && (
        <>
          <Tabs items={tabItems} value={tab} onChange={setTab} />

          {visibleJobs.length === 0 ? (
            <Card className="py-10 text-center text-sm text-text-secondary">No jobs in this view.</Card>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleJobs.map((job) => (
                <ClientJobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
