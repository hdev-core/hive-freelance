import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Input, PageHeader, Textarea } from "../components/ui";
import { useToast } from "../components/ui/ToastProvider";
import { PortfolioLinksEditor, SkillsEditor } from "../components/profile";
import { ApiError } from "../api";
import {
  getMyProfile,
  updateMyProfile,
  type PortfolioLink,
  type ProfileResponse,
  type UpdateProfileInput,
} from "../services/profileService";

const BIO_MAX = 1000;
const DISPLAY_NAME_MAX = 100;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-accent">{message}</p>;
}

function signInLabel(authType: ProfileResponse["authType"]): string {
  return authType === "google" ? "Google" : "Hive Keychain";
}

function roleLabel(role: ProfileResponse["role"]): string {
  if (role === "both") return "Freelancer & Client";
  return role === "freelancer" ? "Freelancer" : "Client";
}

function EditProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="h-24 animate-pulse" />
      <Card className="h-64 animate-pulse" />
    </div>
  );
}

export function EditProfilePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [initial, setInitial] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [location, setLocation] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [portfolioLinks, setPortfolioLinks] = useState<PortfolioLink[]>([]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((data) => {
        if (cancelled) return;
        setInitial(data);
        const p = data.profile;
        setDisplayName(p?.display_name ?? "");
        setBio(p?.bio ?? "");
        setAvatarUrl(p?.avatar_url ?? "");
        setLocation(p?.location ?? "");
        setHourlyRate(p?.hourly_rate ?? "");
        setSkills(p?.skills ?? []);
        setPortfolioLinks(p?.portfolio_links ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canEditSkillsAndRate = initial?.role === "freelancer" || initial?.role === "both";

  function goBack() {
    navigate("..", { relative: "path" });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!initial) return;
    setFormError(null);
    setFieldErrors({});

    const orig = initial.profile;
    const payload: UpdateProfileInput = {};

    const dn = displayName.trim() || null;
    if (dn !== (orig?.display_name ?? null)) payload.display_name = dn;

    const b = bio.trim() || null;
    if (b !== (orig?.bio ?? null)) payload.bio = b;

    const av = avatarUrl.trim() || null;
    if (av !== (orig?.avatar_url ?? null)) payload.avatar_url = av;

    const loc = location.trim() || null;
    if (loc !== (orig?.location ?? null)) payload.location = loc;

    if (canEditSkillsAndRate) {
      const rateTrim = hourlyRate.trim();
      let rateNum: number | null = null;
      if (rateTrim) {
        const parsed = Number(rateTrim);
        if (Number.isNaN(parsed) || parsed <= 0) {
          setFieldErrors({ hourly_rate: "Enter a positive number" });
          return;
        }
        rateNum = parsed;
      }
      const origRate = orig?.hourly_rate != null ? Number(orig.hourly_rate) : null;
      if (rateNum !== origRate) payload.hourly_rate = rateNum;

      const origSkills = orig?.skills ?? [];
      if (JSON.stringify(skills) !== JSON.stringify(origSkills)) {
        payload.skills = skills.length > 0 ? skills : null;
      }
    }

    const origLinks = orig?.portfolio_links ?? [];
    // Drop rows the user opened with "+ Add link" but never filled in —
    // only fully-empty rows are dropped; partially-filled rows are left
    // for the backend's Zod validation to reject with a field error.
    const cleanedLinks = portfolioLinks.filter((link) => link.title.trim() || link.url.trim());
    if (JSON.stringify(cleanedLinks) !== JSON.stringify(origLinks)) {
      payload.portfolio_links = cleanedLinks.length > 0 ? cleanedLinks : null;
    }

    if (Object.keys(payload).length === 0) {
      goBack();
      return;
    }

    setSaving(true);
    try {
      await updateMyProfile(payload);
      showToast("Profile updated");
      goBack();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.details?.length) {
          const next: Record<string, string> = {};
          for (const detail of err.details) {
            const key = String(detail.path[0] ?? "");
            if (key) next[key] = detail.message;
          }
          setFieldErrors(next);
        }
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to save profile");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Link to=".." relative="path" className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft size={16} />
          Back
        </Link>
        <EditProfileSkeleton />
      </div>
    );
  }

  if (loadError || !initial) {
    return (
      <div className="flex flex-col gap-4">
        <Link to=".." relative="path" className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft size={16} />
          Back
        </Link>
        <Card className="py-12 text-center text-sm text-text-primary">
          Couldn't load your profile: {loadError ?? "Unknown error"}
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-6">
      <Link to=".." relative="path" className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
        <ArrowLeft size={16} />
        Back
      </Link>

      <PageHeader
        title="Edit profile"
        subtitle="Changes are saved to your Hive account. Only edited fields are sent."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={goBack} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      {formError && (
        <div className="rounded-2xl border border-accent-subtle-border bg-accent-subtle p-4 text-sm text-text-primary">
          {formError}
        </div>
      )}

      <Card>
        <h2 className="text-base font-semibold text-text-primary">Account</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Hive username</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">@{initial.hiveUsername}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Role</p>
            <p className="mt-1 text-sm font-semibold text-accent">{roleLabel(initial.role)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sign-in method</p>
            <p className="mt-1 text-sm font-semibold text-accent">{signInLabel(initial.authType)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Username, role, and sign-in method are managed elsewhere and can't be edited here.
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-text-primary">Basics</h2>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="display_name" className="text-sm font-medium text-text-secondary">
              Display name <span className="text-accent">*</span>
            </label>
            <span className="text-xs text-text-muted">
              {displayName.length}/{DISPLAY_NAME_MAX}
            </span>
          </div>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
            maxLength={DISPLAY_NAME_MAX}
          />
          <FieldError message={fieldErrors.display_name} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="bio" className="text-sm font-medium text-text-secondary">
              Bio
            </label>
            <span className="text-xs text-text-muted">
              {bio.length}/{BIO_MAX}
            </span>
          </div>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
            rows={5}
          />
          <FieldError message={fieldErrors.bio} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
            <FieldError message={fieldErrors.location} />
          </div>
          {canEditSkillsAndRate && (
            <div>
              <Input
                label="Hourly rate (HBD)"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="Leave blank if not applicable"
              />
              <FieldError message={fieldErrors.hourly_rate} />
            </div>
          )}
        </div>

        <div>
          <Input
            label="Avatar URL"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            hint="Direct link to an image (http/https)."
          />
          <FieldError message={fieldErrors.avatar_url} />
        </div>
      </Card>

      {canEditSkillsAndRate && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Skills</h2>
            <span className="text-xs text-text-muted">{skills.length}/20</span>
          </div>
          <SkillsEditor skills={skills} onChange={setSkills} />
          <FieldError message={fieldErrors.skills} />
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Portfolio links</h2>
          <span className="text-xs text-text-muted">{portfolioLinks.length}/10</span>
        </div>
        <PortfolioLinksEditor links={portfolioLinks} onChange={setPortfolioLinks} />
        <FieldError message={fieldErrors.portfolio_links} />
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={goBack} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
