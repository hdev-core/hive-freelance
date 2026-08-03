import { Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import type { PortfolioLink } from "../../services/profileService";

export function PortfolioLinksEditor({
  links,
  onChange,
  max = 10,
}: {
  links: PortfolioLink[];
  onChange: (links: PortfolioLink[]) => void;
  max?: number;
}) {
  function update(index: number, patch: Partial<PortfolioLink>) {
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }

  function remove(index: number) {
    onChange(links.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      {links.length > 0 && (
        <div className="flex flex-col gap-2">
          {links.map((link, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={link.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Title"
                maxLength={100}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-shadow duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-elevate sm:flex-1"
              />
              <input
                value={link.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://..."
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-shadow duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-elevate sm:flex-1"
              />
              <IconButton aria-label={`Remove link ${i + 1}`} onClick={() => remove(i)} className="shrink-0 self-end sm:self-auto">
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...links, { title: "", url: "" }])}
        disabled={links.length >= max}
      >
        <Plus size={14} />
        Add link
      </Button>
    </div>
  );
}
