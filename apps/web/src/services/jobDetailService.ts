/**
 * Real Jobs API client. Supersedes jobsService.ts's mock in-memory store —
 * every job-facing page (public browse, "my jobs," post, and detail) now
 * reads/writes through here. jobsService.ts and the old JobCard.tsx were
 * deleted along with the last consumer of the mock store; nothing in
 * apps/web renders job.mock.* fields (pricing_type, funding_status,
 * client.*) anymore — those never had a real backing column, so the UI
 * that depended on them was dropped rather than stubbed (see
 * JobDetailPage/SubmitProposalPage/JobDetailSidebar for the same call).
 *
 * Shape source of truth: apps/api/src/{routes,services}/jobs.ts and
 * packages/db/src/types.ts (JobRow).
 */
import { apiFetch } from "../api";

export type JobStatus = "open" | "in_progress" | "completed" | "cancelled";

/** Matches JobRow from packages/db/src/types.ts exactly — the bare shape
 * returned by POST /jobs (a freshly created job has no proposals/reviews
 * yet, so there's nothing to add). */
export type JobRow = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  budget: string;
  category: string | null;
  skills_required: string[] | null;
  status: JobStatus;
  created_at: string;
  updated_at: string;
};

/** GET /jobs (list) response shape — JobRow plus proposalCount and a
 * compact client summary, both computed server-side in services/jobs.ts
 * (a batched review-rating groupBy, not one query per card) so a list of
 * up to 50 cards doesn't mean 50 client-side profile fetches. */
export type JobListItem = JobRow & {
  proposalCount: number;
  client_username: string;
  client_display_name: string | null;
  client_location: string | null;
  client_rating: { average: number | null; count: number };
};

/** GET /jobs/:id response — JobRow plus proposalCount and client_username
 * only. Deliberately lighter than JobListItem: JobDetailSidebar fetches the
 * client's full profile itself (GET /users/:username) since the detail
 * page needs more than a card does (bio, member-since, etc). */
export type JobDetailResponse = JobRow & {
  client_username: string;
  proposalCount: number;
};

export function getJob(id: string): Promise<JobDetailResponse> {
  return apiFetch<JobDetailResponse>(`/api/v1/jobs/${encodeURIComponent(id)}`);
}

/** Public browse — matches GET /jobs' real query contract (category/skill
 * are each single-valued; keyword, budget_min/budget_max filter server-side).
 * No escrow-funded filter: that was funding_status, which never had a real
 * backing field (see the file header). */
export function listJobs(
  params: {
    category?: string;
    skill?: string;
    keyword?: string;
    budget_min?: number;
    budget_max?: number;
    limit?: number;
  } = {},
): Promise<{ items: JobListItem[]; page: number; limit: number }> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.skill) query.set("skill", params.skill);
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.budget_min != null) query.set("budget_min", String(params.budget_min));
  if (params.budget_max != null) query.set("budget_max", String(params.budget_max));
  if (params.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<{ items: JobListItem[]; page: number; limit: number }>(
    `/api/v1/jobs${qs ? `?${qs}` : ""}`,
  );
}

/** "My posted jobs" — every status, not just open, via the client_id
 * filter (services/jobs.ts#listJobs treats client_id specially: it skips
 * the public browse's default open-only filter). */
export function listMyJobs(clientId: string): Promise<{ items: JobListItem[] }> {
  return apiFetch<{ items: JobListItem[] }>(`/api/v1/jobs?client_id=${encodeURIComponent(clientId)}`);
}

/** Matches the real POST /jobs request body (zod schema in routes/jobs.ts)
 * — no pricing_type field, unlike jobsService.ts's mock createJob. */
export type CreateJobInput = {
  title: string;
  description: string;
  budget: number;
  category?: string;
  skills_required?: string[];
};

export function createJob(input: CreateJobInput): Promise<JobRow> {
  return apiFetch<JobRow>(`/api/v1/jobs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PATCH /jobs/:id — the only job-status transition exposed today (routes to
 * cancelJob server-side). Only valid from "open" or "in_progress"; the
 * server re-checks ownership and current status regardless of what the UI
 * shows. */
export function cancelJob(id: string): Promise<JobRow> {
  return apiFetch<JobRow>(`/api/v1/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
  });
}
