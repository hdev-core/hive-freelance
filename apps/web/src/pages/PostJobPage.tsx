import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader, Card, Input, Textarea, Select, Button } from "../components/ui";
import { createJob } from "../services/jobDetailService";

const CATEGORIES = ["Development", "Design", "Writing", "Marketing", "Video & Animation", "Data & AI"];

export function PostJobPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [skillsInput, setSkillsInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skills = skillsInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const budgetNumber = Number(budget);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const job = await createJob({
        title,
        description,
        budget: budgetNumber,
        category,
        skills_required: skills.length > 0 ? skills : undefined,
      });
      navigate(`../${job.id}`, { relative: "path" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post job");
      setSubmitting(false);
    }
  }

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && budgetNumber > 0 && !submitting;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to=".."
        relative="path"
        className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        Back to jobs
      </Link>

      <PageHeader title="Post a Job" subtitle="Describe the work — freelancers will apply once it's live." />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22.5rem]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-text-primary">Job details</h2>
            <Input
              label="Job title"
              placeholder="e.g. Senior Smart Contract Auditor for DeFi Protocol"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Textarea
              label="Description"
              placeholder="Describe the scope, deliverables, and any required expertise..."
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <Input
              label="Skills required"
              placeholder="Comma-separated, e.g. Solidity, Security Audit, DeFi"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              hint="Separate each skill with a comma."
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-text-primary">Budget & category</h2>
            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input
              label="Budget (HBD)"
              type="number"
              min={0}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              required
            />
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-text-secondary">Job summary</p>
              <p className="mt-1 truncate text-base font-semibold text-text-primary">{title || "Untitled job"}</p>
              <p className="text-xs text-text-muted">{category}</p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-sm text-text-secondary">Budget</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {budgetNumber > 0 ? budgetNumber.toLocaleString("en-US") : "0"} HBD
              </p>
            </div>
            {error && <p className="text-sm text-text-primary">{error}</p>}
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {submitting ? "Posting..." : "Post Job"}
            </Button>
            <p className="text-xs text-text-muted">
              Payment is guaranteed by native Hive escrow. Funds release to the freelancer as each milestone is approved
              once you hire.
            </p>
          </Card>
        </div>
      </form>
    </div>
  );
}
