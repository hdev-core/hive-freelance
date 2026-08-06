import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { LinkButton } from "../ui/LinkButton";
import { ClientProfileSummary, type ClientProfileSummaryProps } from "./ClientProfileSummary";
import type { JobDetailResponse } from "../../services/jobDetailService";
import { getProfileByUsername } from "../../services/profileService";
import { formatBudget } from "../../lib/formatBudget";
import { useSession } from "../../hooks/useSession";

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

export function JobDetailSidebar({ job }: { job: JobDetailResponse }) {
  const { loading: sessionLoading, user } = useSession();
  const isLoggedIn = !sessionLoading && !!user;
  const isOwnJob = !!user && user.id === job.client_id;
  const clientProfile = useClientProfile(job.client_username);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-text-secondary">Budget</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">{formatBudget(job.budget)}</p>
        </div>
        {isOwnJob ? (
          <p className="rounded-lg bg-surface-muted p-3 text-xs text-text-secondary">
            This is your job posting. Freelancers can apply once it's open for proposals.
          </p>
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
