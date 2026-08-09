import type { ReactNode } from "react";
import { BadgeCheck, Calendar, KeyRound, MapPin, Pencil, Wallet } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { GoogleIcon } from "../ui/GoogleIcon";
import { LinkButton } from "../ui/LinkButton";
import { RatingStars } from "./RatingStars";
import type { DashboardRole } from "../layout/types";
import type { ProfileResponse } from "../../services/profileService";

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function roleLabel(role: ProfileResponse["role"]): string {
  if (role === "both") return "Freelancer & Client";
  return role === "freelancer" ? "Freelancer" : "Client";
}

function signInMethod(authType: ProfileResponse["authType"]): { label: string; icon: ReactNode } {
  if (authType === "google") return { label: "Google", icon: <GoogleIcon size={14} /> };
  return { label: "Hive Keychain", icon: <KeyRound size={14} /> };
}

export function ProfileHeaderCard({
  profile,
  isOwnProfile,
  role,
}: {
  profile: ProfileResponse;
  isOwnProfile: boolean;
  /** Which dashboard tree we're rendering under ("client"/"freelancer") —
   * NOT profile.role, which is the viewed account's real role and can be
   * "both" (not a valid URL segment). Needed as an absolute path because
   * this card renders at both /:role/profile and /:role/profile/:username;
   * a relative "edit" resolves to .../:username/edit from the latter,
   * which isn't a route. Undefined when rendered from the public,
   * no-login-required /profile/:username route (no DashboardLayout, so no
   * role to derive) — isOwnProfile is only ever true there if a logged-in
   * user happens to land on their own public link, and even then we just
   * skip the edit affordance rather than guess which dashboard to send
   * them to. */
  role?: DashboardRole;
}) {
  const p = profile.profile;
  const displayName = p?.display_name ?? profile.hiveUsername;
  // authType !== "google" means the account is backed by a real Hive keypair
  // (keychain, or claimed after starting as custodial) rather than a
  // custodial Google login — the same signal apps/api/src/routes/auth.ts
  // already surfaces as `custodial` on GET /auth/me. No separate "verified"
  // field exists in the data model, so this is the closest real one.
  const hiveVerified = profile.authType !== "google";
  const canShowRate = profile.role === "freelancer" || profile.role === "both";
  const hourlyRate = p?.hourly_rate != null ? Number(p.hourly_rate) : null;
  const { label: signInLabel, icon: signInIcon } = signInMethod(profile.authType);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="h-24 bg-accent-subtle sm:h-32" />
      <div className="px-6 pb-6">
        <div className="-mt-10 flex items-end justify-between gap-4 sm:-mt-12">
          <Avatar
            name={displayName}
            src={p?.avatar_url}
            size="xl"
            className="border-4 border-surface"
          />
          {isOwnProfile && role && (
            <LinkButton to={`/${role}/profile/edit`} variant="outline" size="sm" className="mb-1">
              <Pencil size={14} />
              Edit profile
            </LinkButton>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{displayName}</h1>
          {hiveVerified && <BadgeCheck size={18} className="text-accent" aria-label="Hive-verified account" />}
        </div>
        <p className="text-sm text-text-secondary">@{profile.hiveUsername}</p>

        {profile.rating.count > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <RatingStars value={profile.rating.average ?? 0} />
            <span className="text-sm font-bold text-text-primary">{profile.rating.average?.toFixed(1)}</span>
            <span className="text-sm text-text-secondary">
              ({profile.rating.count} review{profile.rating.count === 1 ? "" : "s"})
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">No reviews yet</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
          <Badge variant="neutral">{roleLabel(profile.role)}</Badge>
          {p?.location && (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} className="text-text-muted" />
              {p.location}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar size={14} className="text-text-muted" />
            Member since {formatMemberSince(profile.memberSince)}
          </span>
          <span className="flex items-center gap-1.5">
            {signInIcon}
            {signInLabel}
          </span>
          {canShowRate && hourlyRate != null && (
            <span className="flex items-center gap-1.5 font-semibold text-text-primary">
              <Wallet size={14} className="text-text-muted" />
              {hourlyRate.toFixed(2)} HBD/hr
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
