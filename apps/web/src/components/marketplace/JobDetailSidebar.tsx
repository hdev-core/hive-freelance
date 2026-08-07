import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { LinkButton } from "../ui/LinkButton";
import { ClientProfileSummary, type ClientProfileSummaryProps } from "./ClientProfileSummary";
import { cancelJob, type JobDetailResponse } from "../../services/jobDetailService";
import { getProfileByUsername } from "../../services/profileService";
import { listMyProposals } from "../../services/proposalsService";
import { formatBudget } from "../../lib/formatBudget";
import { useSession } from "../../hooks/useSession";

/**
 * Whether the signed-in freelancer already has a proposal on this job —
 * any status, since the backend enforces one proposal per (job, freelancer)
 * pair at the DB level (unique constraint; a rejected proposal's row still
 * occupies that slot, so resubmitting genuinely isn't possible, not just
 * discouraged). Reuses the real "my proposals" listing rather than adding a
 * new endpoint — GET /proposals already returns every proposal the caller
 * has ever submitted, job_id included.
 */
function useAlreadyApplied(jobId: string, enabled: boolean): boolean {
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setApplied(false);
      return;
    }
    let cancelled = false;
    listMyProposals()
      .then((res) => {
        if (!cancelled) setApplied(res.items.some((p) => p.job_id === jobId));
      })
      .catch(() => {
        // A freelancer with zero proposals yet, or a transient fetch
        // failure, should fall back to showing "Apply Now" — the real
        // submit endpoint still enforces the one-proposal-per-job rule
        // server-side either way, so this is a UX nicety, not the guard.
        if (!cancelled) setApplied(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, enabled]);

  return applied;
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Client profile section — fetched separately from job data via the real
 * Profile API (GET /users/:username), keyed off job.client_username. This
 * is a Profile API integration, not a Jobs API one: none of these fields
 * (name/rating/location/member-since) ever lived on the Job model. */
function useClientProfile(username: string): { data: ClientProfileSummaryProps | null; error: string | null } {
  const [data, setData] = useState<ClientProfileSummaryProps | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getProfileByUsername(username)
      .then((res) => {
        if (cancelled) return;
        setData({
          name: res.profile?.display_name ?? res.hiveUsername,
          rating: res.rating.average ?? 0,
          reviewCount: res.rating.count,
          location: res.profile?.location ?? "—",
          memberSince: formatMemberSince(res.memberSince),
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load client profile");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return { data, error };
}

export function JobDetailSidebar({
  job,
  onCancelled,
}: {
  job: JobDetailResponse;
  onCancelled?: (job: JobDetailResponse) => void;
}) {
  const { loading: sessionLoading, user } = useSession();
  const isLoggedIn = !sessionLoading && !!user;
  const isOwnJob = !!user && user.id === job.client_id;
  const isFreelancerRole = user?.role === "freelancer" || user?.role === "both";
  const alreadyApplied = useAlreadyApplied(job.id, isLoggedIn && !isOwnJob && isFreelancerRole);
  const clientProfile = useClientProfile(job.client_username);

  const isCancellable = job.status === "open" || job.status === "in_progress";
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await cancelJob(job.id);
      onCancelled?.({ ...job, ...updated });
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Failed to cancel job");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-text-secondary">Budget</p>
          <p className="mt-1 text-3xl font-bold text-success-text">{formatBudget(job.budget)}</p>
        </div>
        {isOwnJob ? (
          <>
            <p className="rounded-lg bg-surface-muted p-3 text-xs text-text-secondary">
              This is your job posting. Freelancers can apply once it's open for proposals.
            </p>
            {isCancellable && (
              <>
                <Button variant="destructive" onClick={handleCancel} disabled={cancelling} className="w-full">
                  {cancelling ? "Cancelling..." : "Cancel job"}
                </Button>
                {cancelError && <p className="text-xs text-accent">{cancelError}</p>}
              </>
            )}
          </>
        ) : alreadyApplied ? (
          <>
            <Button disabled variant="secondary" className="w-full">
              <CheckCircle2 size={16} />
              Application Sent
            </Button>
            <LinkButton
              to={isLoggedIn ? "../../messages" : "/login"}
              relative={isLoggedIn ? "path" : undefined}
              variant="secondary"
              className="w-full"
            >
              Message Client
            </LinkButton>
          </>
        ) : (
          <>
            <LinkButton to={isLoggedIn ? "apply" : "/login"} className="w-full">
              Apply Now &rarr;
            </LinkButton>
            <LinkButton
              to={isLoggedIn ? "../../messages" : "/login"}
              relative={isLoggedIn ? "path" : undefined}
              variant="secondary"
              className="w-full"
            >
              Message Client
            </LinkButton>
          </>
        )}
      </Card>

      {clientProfile.data ? (
        <Link
          // Logged in: the dashboard-wrapped route (sidebar/header intact).
          // Logged out: the public route (GET /users/:username needs no
          // auth) — no dashboard shell to show them anyway, so the bare
          // page is correct there, not a fallback/downgrade.
          to={
            isLoggedIn
              ? `/client/profile/${encodeURIComponent(job.client_username)}`
              : `/profile/${encodeURIComponent(job.client_username)}`
          }
        >
          <Card interactive>
            <h3 className="mb-4 text-sm font-semibold text-text-primary">About the client</h3>
            <ClientProfileSummary {...clientProfile.data} />
          </Card>
        </Link>
      ) : (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-text-primary">About the client</h3>
          <p className="text-xs text-text-muted">{clientProfile.error ?? "Loading client profile..."}</p>
        </Card>
      )}
    </div>
  );
}
