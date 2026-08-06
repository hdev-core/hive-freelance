import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Badge, Card } from "../ui";
import { listProposalsForJob, type ProposalRow, type ProposalStatus } from "../../services/proposalsService";
import { formatRelativeTime } from "../../lib/formatRelativeTime";

/**
 * Client-facing proposal list/comparison for the job detail page. Takes only
 * `jobId`, not the job object itself — JobDetailPage.tsx still renders from
 * jobsService.ts's mock store (see that file's header comment), so this
 * fetches real proposal data independently instead of depending on the job
 * shape. Keeps this component stable once the Jobs API integration lands
 * and JobDetailPage's mock job type goes away.
 */
export function ProposalsList({ jobId }: { jobId: string }) {
  const [proposals, setProposals] = useState<ProposalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProposals(null);
    setError(null);
    listProposalsForJob(jobId)
      .then((res) => {
        if (!cancelled) setProposals(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load proposals");
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (error) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-text-primary">Proposals</h2>
        <p className="text-sm text-text-secondary">Couldn't load proposals: {error}</p>
      </Card>
    );
  }

  if (!proposals) {
    return (
      <Card className="animate-pulse">
        <div className="h-4 w-32 rounded bg-surface-muted" />
        <div className="mt-4 h-20 rounded bg-surface-muted" />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <FileText size={16} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-text-primary">Proposals ({proposals.length})</h2>
          <p className="text-xs text-text-secondary">Compare freelancer bids, timelines, and milestone breakdowns.</p>
        </div>
      </div>

      {proposals.length === 0 ? (
        <p className="text-sm text-text-secondary">No proposals yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </Card>
  );
}

const statusVariant: Record<ProposalStatus, "neutral" | "success" | "accent"> = {
  pending: "neutral",
  accepted: "success",
  rejected: "accent",
};

const statusLabel: Record<ProposalStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

function ProposalCard({ proposal }: { proposal: ProposalRow }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text-primary">Freelancer #{proposal.freelancer_id}</p>
          <p className="text-xs text-text-muted">{formatRelativeTime(new Date(proposal.created_at))}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[proposal.status]}>{statusLabel[proposal.status]}</Badge>
          <span className="text-base font-bold text-text-primary">
            {Number(proposal.bid_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
          </span>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-line text-sm text-text-secondary">{proposal.cover_letter}</p>

      {(proposal.estimated_duration || proposal.available_to_start) && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary">
          {proposal.estimated_duration && (
            <span>
              <span className="text-text-muted">Duration:</span> {proposal.estimated_duration}
            </span>
          )}
          {proposal.available_to_start && (
            <span>
              <span className="text-text-muted">Available:</span> {proposal.available_to_start}
            </span>
          )}
        </div>
      )}

      {proposal.milestones.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 rounded-lg bg-surface-muted p-3">
          {proposal.milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">
                {m.title} <span className="text-text-muted">— {m.duration} (proposed duration)</span>
              </span>
              <span className="font-medium text-text-primary">
                {Number(m.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
              </span>
            </div>
          ))}
          <p className="mt-1 text-[11px] text-text-muted">
            Milestone durations above are proposed timelines only — not tracked or enforced after the contract is
            created.
          </p>
        </div>
      )}

      {proposal.portfolio_links && proposal.portfolio_links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {proposal.portfolio_links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-accent hover:underline"
            >
              {link.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
