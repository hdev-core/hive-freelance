/**
 * Profile API client. Shape source of truth: API_PROFILE.md (repo root) and
 * apps/api/src/{routes,services}/profiles.ts — this is the real, already-shipped
 * backend, not a mock (unlike jobsService.ts's mock layer).
 */
import { apiFetch } from "../api";

export type PortfolioLink = {
  title: string;
  url: string;
};

/** Matches ProfileRow from packages/db/src/types.ts. */
export type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  hourly_rate: string | null;
  skills: string[] | null;
  portfolio_links: PortfolioLink[] | null;
  created_at: string;
  updated_at: string;
};

/** Matches the response shape from services/profiles.ts#getPublicProfile. */
export type ProfileResponse = {
  id: string;
  hiveUsername: string;
  role: "client" | "freelancer" | "both";
  authType: "keychain" | "google" | "claimed";
  memberSince: string;
  rating: { average: number | null; count: number };
  profile: ProfileRow | null;
};

/** Matches the PUT /users/me/profile request body (routes/users.ts). */
export type UpdateProfileInput = {
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  location?: string | null;
  hourly_rate?: number | null;
  skills?: string[] | null;
  portfolio_links?: PortfolioLink[] | null;
};

export function getMyProfile(): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>("/api/v1/users/me");
}

export function getProfileByUsername(username: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>(`/api/v1/users/${encodeURIComponent(username)}`);
}

export function updateMyProfile(input: UpdateProfileInput): Promise<{ profile: ProfileRow }> {
  return apiFetch<{ profile: ProfileRow }>("/api/v1/users/me/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
