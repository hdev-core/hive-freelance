import { Card } from "../ui/Card";
import { LinkButton } from "../ui/LinkButton";
import { ClientProfileSummary } from "./ClientProfileSummary";
import { MOCK_CURRENT_CLIENT_ID, type MockJob } from "../../services/jobsService";
import { formatBudget } from "../../lib/formatBudget";
import { useSession } from "../../hooks/useSession";

const PLATFORM_FEE_PERCENT = 2;

export function JobDetailSidebar({ job }: { job: MockJob }) {
  const budgetAmount = Number(job.budget);
  const feeAmount = Math.round(budgetAmount * (PLATFORM_FEE_PERCENT / 100));
  const isOwnJob = job.client_id === MOCK_CURRENT_CLIENT_ID;
  const { loading: sessionLoading, user } = useSession();
  const isLoggedIn = !sessionLoading && !!user;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-text-secondary">{job.mock.pricing_type === "hourly" ? "Hourly price" : "Fixed price"}</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">{formatBudget(job.budget, job.mock.pricing_type)}</p>
          {job.mock.pricing_type === "fixed" && (
            <p className="mt-2 text-xs text-text-muted">
              Platform fee ({PLATFORM_FEE_PERCENT}%): {feeAmount.toLocaleString("en-US")} HBD &middot; paid by client
            </p>
          )}
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

      <Card>
        <h3 className="mb-4 text-sm font-semibold text-text-primary">About the client</h3>
        <ClientProfileSummary
          name={job.mock.client.name}
          rating={job.mock.client.rating}
          reviewCount={job.mock.client.review_count}
          location={job.mock.client.location}
          totalSpent={job.mock.client.total_spent}
          memberSince={job.mock.client.member_since}
          verified={job.mock.client.verified}
        />
      </Card>
    </div>
  );
}
