import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlignLeft, ArrowLeft, Calendar, CheckCircle2, Clock, Link2, Star, Users } from "lucide-react";
import { Avatar, Badge, Button, Card, Select, Tabs, type TabItem } from "../components/ui";
import { StatusBadge } from "../components/marketplace";
import { getJob, type JobDetailResponse } from "../services/jobDetailService";
import {
  acceptProposal,
  confirmAcceptProposal,
  getAcceptCustomJson,
  listProposalsForJob,
  rejectProposal,
  type ProposalStatus,
  type ProposalWithFreelancer,
} from "../services/proposalsService";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { formatBudget } from "../lib/formatBudget";
import { useSession } from "../hooks/useSession";
import { requestKeychainBroadcast } from "../lib/keychain";
import { cn } from "../lib/cn";

type TabValue = "all" | ProposalStatus;

/** Local to this page's fuller card layout — deliberately not Badge's
 * "accent" variant (solid fill) for "rejected", to match the mockup's soft
 * red pill; same accent-subtle treatment StatusBadge already uses for
 * "open". Warning/success reuse Badge's real semantic-status colors. */
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

export function JobProposalsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();

  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [proposals, setProposals] = useState<ProposalWithFreelancer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabValue>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "bid">("newest");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function reload() {
    if (!id) return;
    const [jobData, proposalsData] = await Promise.all([getJob(id), listProposalsForJob(id)]);
    setJob(jobData);
    setProposals(proposalsData.items);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    reload().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load proposals");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabValue, number> = { all: 0, pending: 0, accepted: 0, rejected: 0 };
    if (!proposals) return counts;
    counts.all = proposals.length;
    for (const p of proposals) counts[p.status] += 1;
    return counts;
  }, [proposals]);

  const tabItems: TabItem<TabValue>[] = [
    { value: "all", label: "All", count: tabCounts.all },
    { value: "pending", label: "Pending", count: tabCounts.pending },
    { value: "accepted", label: "Accepted", count: tabCounts.accepted },
    { value: "rejected", label: "Rejected", count: tabCounts.rejected },
  ];

  const visible = useMemo(() => {
    if (!proposals) return [];
    const filtered = tab === "all" ? proposals : proposals.filter((p) => p.status === tab);
    return [...filtered].sort((a, b) => {
      if (sort === "bid") return Number(b.bid_amount) - Number(a.bid_amount);
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "newest" ? -diff : diff;
    });
  }, [proposals, tab, sort]);

  function toggleExpanded(proposalId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(proposalId)) next.delete(proposalId);
      else next.add(proposalId);
      return next;
    });
  }

  async function handleAccept(proposalId: string) {
    if (!user) return;
    setBusyId(proposalId);
    setActionError(null);
    try {
      const result = await acceptProposal(proposalId);
      const payload = {
        ...result.custom_json,
        required_posting_auths: [user.username],
      };
      const hive_tx_id = await requestKeychainBroadcast(user.username, [["custom_json", payload]], "Posting");
      await confirmAcceptProposal(proposalId, hive_tx_id);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to accept proposal");
      // The contract may already have been created (accept succeeded)
      // before the Keychain broadcast failed/was cancelled — reload so the
      // UI reflects the real accepted-but-unconfirmed state instead of
      // still showing "Pending".
      await reload().catch(() => {});
    } finally {
      setBusyId(null);
    }
  }

  /** Retry path for a proposal that's `accepted` in the DB but has no
   * hive_tx_id — acceptProposal can't be called again (proposal is no
   * longer `pending`), so this re-fetches the same custom_json and retries
   * just the broadcast + confirm steps. */
  async function handleConfirmOnChain(proposalId: string) {
    if (!user) return;
    setBusyId(proposalId);
    setActionError(null);
    try {
      const { custom_json } = await getAcceptCustomJson(proposalId);
      const payload = {
        ...custom_json,
        required_posting_auths: [user.username],
      };
      const hive_tx_id = await requestKeychainBroadcast(user.username, [["custom_json", payload]], "Posting");
      await confirmAcceptProposal(proposalId, hive_tx_id);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to confirm on-chain");
      await reload().catch(() => {});
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(proposalId: string) {
    setBusyId(proposalId);
    setActionError(null);
    try {
      await rejectProposal(proposalId);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject proposal");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <Link
        to="../.."
        relative="path"
        className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        Back to My Jobs
      </Link>

      {error && (
        <div className="rounded-2xl border border-accent-subtle-border bg-accent-subtle p-6 text-sm text-text-primary">
          Couldn't load this job's proposals: {error}
        </div>
      )}

      {!error && job && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{job.category ?? "General"}</Badge>
            <StatusBadge status={job.status} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span>
              Budget: <span className="font-semibold text-success-text">{formatBudget(job.budget)}</span>
            </span>
            <span aria-hidden>&bull;</span>
            <span className="flex items-center gap-1">
              <Users size={14} className="shrink-0" />
              {job.proposalCount} proposal{job.proposalCount === 1 ? "" : "s"}
            </span>
            <span aria-hidden>&bull;</span>
            <span className="flex items-center gap-1">
              <Clock size={14} className="shrink-0" />
              Posted {formatRelativeTime(new Date(job.created_at))}
            </span>
          </div>
        </div>
      )}

      {!error && (
        <div className="flex flex-nowrap items-center justify-between gap-3 border-b border-border">
          <div className="min-w-0 flex-1">
            <Tabs items={tabItems} value={tab} onChange={setTab} bordered={false} />
          </div>
          <div className="flex shrink-0 items-center gap-2 pb-2 text-sm text-text-secondary">
            <span className="whitespace-nowrap">Sort by:</span>
            {/* Select's base style sets w-full; this app's `cn()` is a plain
                join (no tailwind-merge), so a conflicting width className
                doesn't reliably win the cascade. An inline style always
                beats a class, so it's used here instead of fighting that. */}
            <Select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value as "newest" | "oldest" | "bid")}
              className="py-1"
              style={{ width: "9rem" }}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="bid">Highest bid</option>
            </Select>
          </div>
        </div>
      )}

      {!error && proposals && (
        <p className="text-sm text-text-secondary">
          Showing {visible.length} proposal{visible.length === 1 ? "" : "s"}
        </p>
      )}

      {actionError && (
        <div className="rounded-2xl border border-accent-subtle-border bg-accent-subtle p-4 text-sm text-text-primary">
          {actionError}
        </div>
      )}

      {!error && !proposals && (
        <Card className="animate-pulse">
          <div className="h-4 w-32 rounded bg-surface-muted" />
          <div className="mt-4 h-24 rounded bg-surface-muted" />
        </Card>
      )}

      {!error && proposals && visible.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-muted text-text-secondary">
            <AlignLeft size={22} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {tab === "all" ? "No proposals yet" : `No ${tab} proposals`}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {tab === "all"
                ? "Proposals from freelancers will appear here once they apply to your job."
                : "Try a different tab to see proposals in other states."}
            </p>
          </div>
        </Card>
      )}

      {!error && proposals && visible.length > 0 && (
        <div className="flex flex-col gap-4">
          {visible.map((proposal) => (
            <ProposalDetailCard
              key={proposal.id}
              proposal={proposal}
              expanded={expandedIds.has(proposal.id)}
              onToggleExpanded={() => toggleExpanded(proposal.id)}
              onAccept={() => handleAccept(proposal.id)}
              onReject={() => handleReject(proposal.id)}
              onConfirm={() => handleConfirmOnChain(proposal.id)}
              busy={busyId === proposal.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalDetailCard({
  proposal,
  expanded,
  onToggleExpanded,
  onAccept,
  onReject,
  onConfirm,
  busy,
}: {
  proposal: ProposalWithFreelancer;
  expanded: boolean;
  onToggleExpanded: () => void;
  onAccept: () => void;
  onReject: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const coverLetterIsLong = proposal.cover_letter.length > 220;
  const displayName = proposal.freelancer_display_name ?? proposal.freelancer_username;

  return (
    <Card className={cn("flex flex-col gap-3", proposal.status === "rejected" && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={displayName} src={proposal.freelancer_avatar_url} size="md" />
          <div>
            <p className="text-sm font-semibold text-text-primary">{displayName}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {proposal.freelancer_rating.count > 0 && (
                <span className="flex items-center gap-1">
                  <Star size={12} className="fill-accent text-accent" />
                  {proposal.freelancer_rating.average?.toFixed(1)}
                </span>
              )}
              {proposal.freelancer_top_skill && <span>{proposal.freelancer_top_skill}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-lg font-bold text-success-text">
            {Number(proposal.bid_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              statusPillClassName[proposal.status],
            )}
          >
            {statusLabel[proposal.status]}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {proposal.estimated_duration && (
          <span className="flex items-center gap-1">
            <Clock size={12} className="shrink-0" />
            Duration: {proposal.estimated_duration}
          </span>
        )}
        {proposal.available_to_start && (
          <span className="flex items-center gap-1">
            <Calendar size={12} className="shrink-0" />
            Starts: {proposal.available_to_start}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock size={12} className="shrink-0" />
          Submitted {formatRelativeTime(new Date(proposal.created_at))}
        </span>
      </div>

      <div>
        <p className={`whitespace-pre-line text-sm text-text-secondary ${expanded ? "" : "line-clamp-2"}`}>
          {proposal.cover_letter}
        </p>
        {coverLetterIsLong && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="mt-1 inline-block rounded-none border-0 bg-transparent p-0 text-xs font-medium text-accent hover:bg-transparent hover:underline active:bg-transparent"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {proposal.milestones.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Milestones</p>
          {proposal.milestones.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 text-xs">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent">
                {i + 1}
              </span>
              <span className="flex-1 text-text-secondary">
                {m.title} <span className="text-text-muted">— {m.duration} (proposed duration)</span>
              </span>
              <span className="shrink-0 font-medium text-success-text">
                {Number(m.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-xs font-bold text-success-text">
            <span>Total</span>
            <span>{Number(proposal.bid_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD</span>
          </div>
        </div>
      )}

      {proposal.portfolio_links && proposal.portfolio_links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {proposal.portfolio_links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-accent-subtle-border bg-accent-subtle px-3 py-1 text-xs font-medium text-accent hover:underline"
            >
              <Link2 size={12} />
              {link.title}
            </a>
          ))}
        </div>
      )}

      {proposal.status === "pending" && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button onClick={onAccept} disabled={busy} className="flex-1">
            {busy ? "Working..." : "Accept proposal"}
          </Button>
          <Button variant="secondary" onClick={onReject} disabled={busy} className="flex-1">
            Reject
          </Button>
        </div>
      )}

      {proposal.status === "accepted" && proposal.hive_tx_id == null && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs text-text-secondary">
            Contract created, but the on-chain confirmation didn't go through. Retry it to finish accepting this
            proposal.
          </p>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : "Confirm on-chain"}
          </Button>
        </div>
      )}

      {proposal.status === "accepted" && proposal.hive_tx_id != null && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-success-bg px-4 py-2.5 text-sm font-semibold text-success-text">
          <CheckCircle2 size={16} />
          Proposal accepted — contract in progress
        </div>
      )}
    </Card>
  );
}
