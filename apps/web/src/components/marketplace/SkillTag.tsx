/**
 * Deliberately not reusing ui/Tag's default (Accent Subtle bg + neutral
 * text) — per direct design feedback skill pills use red TEXT on the Accent
 * Subtle background, same scoped exception as StatusBadge. Contrast-checked
 * ~6.8:1 (light) / ~4.8:1 (dark) — passes WCAG AA in both themes.
 */
export function SkillTag({ skill }: { skill: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent-subtle-border bg-accent-subtle px-3 py-1 text-xs font-medium text-accent">
      {skill}
    </span>
  );
}
