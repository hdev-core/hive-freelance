import { useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import { PageHeader, Card, LinkButton } from "../components/ui";
import { JobListCard } from "../components/marketplace";
import { listMyJobs, type JobListItem } from "../services/jobDetailService";
import { useSession } from "../hooks/useSession";

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your posted jobs"
        subtitle="Create and manage the jobs you've posted."
        actions={
          <LinkButton to="new" variant="primary">
            Post a Job
          </LinkButton>
        }
      />

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
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <JobListCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
