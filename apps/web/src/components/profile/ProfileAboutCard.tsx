import { Card } from "../ui/Card";

export function ProfileAboutCard({ bio }: { bio: string | null }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary">About</h2>
      {bio ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{bio}</p>
      ) : (
        <p className="mt-3 text-sm text-text-muted">No bio yet.</p>
      )}
    </Card>
  );
}
