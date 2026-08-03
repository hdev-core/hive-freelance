import { ExternalLink, Link as LinkIcon } from "lucide-react";
import { Card } from "../ui/Card";
import type { PortfolioLink } from "../../services/profileService";

export function ProfilePortfolioCard({ links }: { links: PortfolioLink[] }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary">Portfolio</h2>
      {links.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-border p-3 transition-shadow duration-150 hover:border-border-strong hover:shadow-elevate"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
                <LinkIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text-primary">{link.title}</span>
                <span className="block truncate text-xs text-text-secondary">{link.url}</span>
              </span>
              <ExternalLink size={14} className="shrink-0 text-text-muted" />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-muted">No portfolio links yet.</p>
      )}
    </Card>
  );
}
