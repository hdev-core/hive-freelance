import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileText } from "lucide-react";
import { Badge, Card, LinkButton, PageHeader, Tabs, type TabItem } from "../components/ui";
import { cn } from "../lib/cn";
import {
  listMyProposals,
  type MilestoneStatus,
  type MyProposalRow,
  type ProposalStatus,
} from "../services/proposalsService";
import { formatRelativeTime } from "../lib/formatRelativeTime";

const milestoneStatusLabel: Record<MilestoneStatus, string> = {
  pending: "Pending",
  funded: "Funded",
  submitted: "Submitted",
  approved: "Approved",
  released: "Released",
};

const milestoneStatusVariant: Record<MilestoneStatus, "neutral" | "success" | "warning"> = {
  pending: "neutral",
  funded: "neutral",
  submitted: "warning",
  approved: "success",
  released: "success",
};

// Same soft-pill treatment as JobProposalsPage's per-card status pill, kept
// local here too since it's specific to this fuller card layout, not the
// compact ProposalsList badge.
const statusPillClassName: Record<ProposalStatus, string> = {
  pending: "bg-warning-bg text-warning-text",
  accepted: "bg-success-bg text-success-text",
  rejected: "border border-accent-subtle-border bg-accent-subtle text-accent",
};

const statusLabel: Record<ProposalStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

type TabValue = "all" | ProposalStatus;

function MyProposalsSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="h-4 w-32 rounded bg-surface-muted" />
      <div className="mt-4 h-20 rounded bg-surface-muted" />
    </Card>
  );
}

export function MyProposalsPage() {
  const [proposals, setProposals] = useState<MyProposalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>("all");

  useEffect(() => {
    let cancelled = false;
    listMyProposals()
      .then((res) => {
        if (!cancelled) setProposals(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load your proposals");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Total paid out" / "In escrow" aggregate stats from the mockup are
  // deliberately not implemented here — see the Known follow-up note below.
  const counts = useMemo(() => {
    const c = { total: 0, accepted: 0, pending: 0, rejected: 0 };
    if (!proposals) return c;
    c.total = proposals.length;
    for (const p of proposals) c[p.status] += 1;
    return c;
  }, [proposals]);

  const tabItems: TabItem<TabValue>[] = [
    { value: "all", label: "All", count: counts.total },
    { value: "accepted", label: "Accepted", count: counts.accepted },
    { value: "pending", label: "Pending", count: counts.pending },
    { value: "rejected", label: "Rejected", count: counts.rejected },
  ];

  const visible = useMemo(
    () => (!proposals ? [] : tab === "all" ? proposals : proposals.filter((p) => p.status === tab)),
    [proposals, tab],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="My Proposals"
        subtitle="Track the proposals you've submitted to clients."
        actions={
          <LinkButton to="/freelancer/jobs" variant="primary">
            Find work
          </LinkButton>
        }
      />

      {!error && proposals && (
        <div className="grid grid-cols-2 gap-4">
          <Card padding="sm" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <FileText size={14} />
            </span>
            <div>
              <p className="text-2xl font-bold text-text-primary">{counts.total}</p>
              <p className="text-sm text-text-secondary">Total submitted</p>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-bg text-success-text">
              <CheckCircle2 size={14} />
            </span>
            <div>
              <p className="text-2xl font-bold text-text-primary">{counts.accepted}</p>
              <p className="text-sm text-text-secondary">Accepted</p>
            </div>
          </Card>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-accent-subtle-border bg-accent-subtle p-6 text-sm text-text-primary">
          Couldn't load your proposals: {error}
        </div>
      )}

      {!error && !proposals && (
        <div className="flex flex-col gap-4">
          <MyProposalsSkeleton />
          <MyProposalsSkeleton />
        </div>
      )}

      {!error && proposals && proposals.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-text-primary">
            <FileText size={22} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">No proposals yet</h2>
            <p className="mt-1 text-sm text-text-secondary">Submit a proposal on a job to see it tracked here.</p>
          </div>
          <LinkButton to="/freelancer/jobs" variant="primary">
            Find work
          </LinkButton>
        </Card>
      )}

      {!error && proposals && proposals.length > 0 && (
        <>
          <Tabs items={tabItems} value={tab} onChange={setTab} />

          {visible.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-muted text-text-secondary">
                <FileText size={22} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">No {tab} proposals</h2>
                <p className="mt-1 text-sm text-text-secondary">Try a different tab to see proposals in other states.</p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {visible.map((proposal) => (
                <MyProposalCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MyProposalCard({ proposal }: { proposal: MyProposalRow }) {
  const milestones = proposal.contract_milestones;
  const releasedCount = milestones ? milestones.filter((m) => m.status === "released").length : 0;

  return (
    <Card className={cn("flex flex-col gap-3", proposal.status === "rejected" && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/freelancer/jobs/${proposal.job_id}`}
            className="text-sm font-semibold text-text-primary hover:underline"
          >
            {proposal.job_title}
          </Link>
          <p className="text-xs text-text-muted">
            Submitted {formatRelativeTime(new Date(proposal.created_at))}
            {proposal.estimated_duration && ` · Est. ${proposal.estimated_duration}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              statusPillClassName[proposal.status],
            )}
          >
            {statusLabel[proposal.status]}
          </span>
          <span className="text-base font-bold text-success-text">
            {Number(proposal.bid_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
          </span>
        </div>
      </div>

      {proposal.status === "accepted" && milestones && milestones.length > 0 && (
        <div className="rounded-lg bg-surface-muted p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-text-primary">
            <span>Milestone progress</span>
            <span>
              {releasedCount}/{milestones.length} released
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(releasedCount / milestones.length) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {milestones.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent">
                  {i + 1}
                </span>
                <span className="flex-1 text-text-secondary">{m.title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={milestoneStatusVariant[m.status]}>{milestoneStatusLabel[m.status]}</Badge>
                  <span className="font-medium text-success-text">
                    {Number(m.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {proposal.status === "accepted" && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-success-bg px-4 py-2.5 text-sm font-semibold text-success-text">
          <CheckCircle2 size={16} />
          Proposal accepted — contract in progress
        </div>
      )}

      {proposal.status === "rejected" && (
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
          <p className="text-text-muted">This proposal was not selected by the client.</p>
          <Link to="/freelancer/jobs" className="font-medium text-accent hover:underline">
            Find similar jobs
          </Link>
        </div>
      )}
    </Card>
  );
}
