import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/Button";

export function SkillsEditor({
  skills,
  onChange,
  max = 20,
  maxLength = 50,
}: {
  skills: string[];
  onChange: (skills: string[]) => void;
  max?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState("");
  const atLimit = skills.length >= max;

  function addSkill() {
    const value = draft.trim().slice(0, maxLength);
    if (!value || atLimit) return;
    if (skills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...skills, value]);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-subtle-border bg-accent-subtle py-1 pl-3 pr-1.5 text-xs font-medium text-accent"
            >
              {skill}
              <button
                type="button"
                onClick={() => onChange(skills.filter((s) => s !== skill))}
                aria-label={`Remove ${skill}`}
                className="flex h-4 w-4 items-center justify-center rounded-full border-0 bg-transparent p-0 text-accent hover:bg-accent-subtle-border"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a skill and press Enter"
          disabled={atLimit}
          className="w-full flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-shadow duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-elevate disabled:opacity-50"
        />
        <Button type="button" variant="secondary" onClick={addSkill} disabled={!draft.trim() || atLimit}>
          <Plus size={14} />
          Add
        </Button>
      </div>
    </div>
  );
}
