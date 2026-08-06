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

/** Real MilestoneStatus enum from packages/db/src/types.ts — the contract-
 * stage Milestone model, distinct from ProposalMilestoneRow above (which has
 * no status at all). Exactly these five values, nothing else. */
export type MilestoneStatus = "pending" | "funded" | "submitted" | "approved" | "released";

/** Matches MilestoneRow from packages/db/src/types.ts. */
export type MilestoneRow = {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  amount: string;
  milestone_order: number;
  status: MilestoneStatus;
  submitted_at: string | null;
  approved_at: string | null;
  hive_tx_id: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /jobs/:id/proposals response shape — ProposalRow plus the freelancer
 * fields joined in services/proposals.ts#listProposalsForJob (username,
 * display name, rating, and top skill standing in for a "role" line since
 * Profile has no headline/title field). */
export type ProposalWithFreelancer = ProposalRow & {
  freelancer_username: string;
  freelancer_display_name: string | null;
  freelancer_avatar_url: string | null;
  freelancer_top_skill: string | null;
  freelancer_rating: { average: number | null; count: number };
};

/** GET /proposals response shape ("My Proposals") — ProposalRow plus the
 * parent job's title/status and, once accepted, the real contract-stage
 * milestones (null until a contract exists). */
export type MyProposalRow = ProposalRow & {
  job_title: string;
  job_status: string;
  contract_milestones: MilestoneRow[] | null;
};

export function listProposalsForJob(jobId: string): Promise<{ items: ProposalWithFreelancer[] }> {
  return apiFetch<{ items: ProposalWithFreelancer[] }>(`/api/v1/jobs/${encodeURIComponent(jobId)}/proposals`);
}

/** The signed-in freelancer's own proposals, every job, every status. */
export function listMyProposals(): Promise<{ items: MyProposalRow[] }> {
  return apiFetch<{ items: MyProposalRow[] }>(`/api/v1/proposals`);
}

export function submitProposal(jobId: string, input: SubmitProposalInput): Promise<ProposalRow> {
  return apiFetch<ProposalRow>(`/api/v1/jobs/${encodeURIComponent(jobId)}/proposals`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type AcceptProposalResult = {
  contract: { id: string; status: string; total_amount: string };
  custom_json: {
    id: string;
    json: string;
    required_auths: string[];
    required_posting_auths: string[];
  };
};

/** POST /proposals/:id/accept — creates the contract and returns the
 * custom_json op the client must broadcast via Keychain; the result must
 * then be confirmed with confirmAcceptProposal. See AcceptProposalTestPage
 * for the original smoke-tested flow this mirrors. */
export function acceptProposal(proposalId: string): Promise<AcceptProposalResult> {
  return apiFetch<AcceptProposalResult>(`/api/v1/proposals/${encodeURIComponent(proposalId)}/accept`, {
    method: "POST",
  });
}

export function confirmAcceptProposal(
  proposalId: string,
  hiveTxId: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/v1/proposals/${encodeURIComponent(proposalId)}/accept/confirm`, {
    method: "PATCH",
    body: JSON.stringify({ hive_tx_id: hiveTxId }),
  });
}

export function rejectProposal(proposalId: string): Promise<ProposalRow> {
  return apiFetch<ProposalRow>(`/api/v1/proposals/${encodeURIComponent(proposalId)}/reject`, {
    method: "POST",
  });
}
