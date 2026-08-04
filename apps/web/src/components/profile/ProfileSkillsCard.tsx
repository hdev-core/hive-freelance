import { Card } from "../ui/Card";
import { SkillTag } from "../marketplace/SkillTag";

export function ProfileSkillsCard({ skills }: { skills: string[] }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary">Skills</h2>
      {skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {skills.map((skill) => (
            <SkillTag key={skill} skill={skill} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-muted">No skills listed yet.</p>
      )}
    </Card>
  );
}
