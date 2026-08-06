/**
 * Proposals API client. Real, already-shipped backend (apps/api/src/{routes,services}/proposals.ts).
 * Shape source of truth: packages/db/src/types.ts
 * (ProposalRow, ProposalMilestoneRow) and the zod body schema in routes/proposals.ts.
 */
import { apiFetch } from "../api";
import type { PortfolioLink } from "./profileService";

export type ProposalStatus = "pending" | "accepted" | "rejected";

/** Matches ProposalMilestoneRow from packages/db/src/types.ts. `duration` is
 * proposal-stage-only — it is never promoted into a real Milestone row once
 * a contract is created, so it must never be presented as tracked/binding. */
export type ProposalMilestoneRow = {
  id: string;
  proposal_id: string;
  title: string;
  amount: string;
  duration: string;
  milestone_order: number;
};

/** Matches ProposalRow from packages/db/src/types.ts, plus milestones (only
 * present on responses that include them — list/create, not every route). */
export type ProposalRow = {
  id: string;
  job_id: string;
  freelancer_id: string;
  cover_letter: string;
  bid_amount: string;
  status: ProposalStatus;
  hive_tx_id: string | null;
  estimated_duration: string | null;
  available_to_start: string | null;
  portfolio_links: PortfolioLink[] | null;
  created_at: string;
  updated_at: string;
  milestones: ProposalMilestoneRow[];
};

export type SubmitProposalMilestoneInput = {
  title: string;
  amount: number;
  duration: string;
};

/** Matches the POST /jobs/:id/proposals request body (zod schema in routes/proposals.ts). */
export type SubmitProposalInput = {
  cover_letter: string;
  bid_amount: number;
  estimated_duration?: string | null;
  available_to_start?: string | null;
  portfolio_links?: PortfolioLink[] | null;
  milestones: SubmitProposalMilestoneInput[];
};

export function listProposalsForJob(jobId: string): Promise<{ items: ProposalRow[] }> {
  return apiFetch<{ items: ProposalRow[] }>(`/api/v1/jobs/${encodeURIComponent(jobId)}/proposals`);
}

export function submitProposal(jobId: string, input: SubmitProposalInput): Promise<ProposalRow> {
  return apiFetch<ProposalRow>(`/api/v1/jobs/${encodeURIComponent(jobId)}/proposals`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
