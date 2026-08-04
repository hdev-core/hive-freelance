import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/ui";
import {
  ProfileAboutCard,
  ProfileHeaderCard,
  ProfilePortfolioCard,
  ProfileSkillsCard,
} from "../components/profile";
import { getMyProfile, getProfileByUsername, type ProfileResponse } from "../services/profileService";
import { useSession } from "../hooks/useSession";

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="h-56 animate-pulse" padding="none" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22.5rem]">
        <Card className="h-40 animate-pulse" />
        <Card className="h-40 animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Renders both "view my own profile" (no :username — GET /users/me) and
 * "view someone else's profile" (:username — GET /users/:username) from the
 * same component, per the mockups. Which sections render (Skills, hourly
 * rate, the Edit button) is driven by role/ownership data in the response,
 * not by which route was used to get here.
 */
export function ProfilePage() {
  const { username } = useParams<{ username?: string }>();
  const { user: sessionUser } = useSession();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = username ? getProfileByUsername(username) : getMyProfile();
    request
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const isOwnProfile = !username || sessionUser?.username === profile?.hiveUsername;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to=".."
        relative="path"
        className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        Back
      </Link>

      {loading && <ProfileSkeleton />}

      {!loading && error && (
        <Card className="py-12 text-center text-sm text-text-primary">Couldn't load this profile: {error}</Card>
      )}

      {!loading && !error && profile && (
        <div className="flex flex-col gap-6">
          <ProfileHeaderCard profile={profile} isOwnProfile={isOwnProfile} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22.5rem]">
            <div className="flex flex-col gap-6">
              <ProfileAboutCard bio={profile.profile?.bio ?? null} />
              {(profile.role === "freelancer" || profile.role === "both") && (
                <ProfileSkillsCard skills={profile.profile?.skills ?? []} />
              )}
            </div>
            <ProfilePortfolioCard links={profile.profile?.portfolio_links ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}
