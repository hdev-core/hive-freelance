import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { LinkButton } from "../ui/LinkButton";
import { ClientProfileSummary } from "./ClientProfileSummary";
import type { MockJob } from "../../services/jobsService";
import { formatBudget } from "../../lib/formatBudget";

const PLATFORM_FEE_PERCENT = 2;

export function JobDetailSidebar({ job }: { job: MockJob }) {
  const budgetAmount = Number(job.budget);
  const feeAmount = Math.round(budgetAmount * (PLATFORM_FEE_PERCENT / 100));

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
        <LinkButton to={`/jobs/${job.id}/apply`} className="w-full">
          Apply Now &rarr;
        </LinkButton>
        <Button variant="secondary" className="w-full" type="button">
          Message Client
        </Button>
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
