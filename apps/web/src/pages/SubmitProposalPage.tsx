import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import { Button, Card, IconButton, Input, PageHeader, Textarea } from "../components/ui";
import { getJob, type JobDetailResponse } from "../services/jobDetailService";
import { submitProposal, type SubmitProposalMilestoneInput } from "../services/proposalsService";
import { formatBudget } from "../lib/formatBudget";

// No real fee/payments field exists on the backend yet for the M3 flow —
// kept as a clearly isolated, commented constant instead of inventing a
// backend contract. Replace with a real value once a fee endpoint/field
// exists.
const SERVICE_FEE_RATE = 0.1;

type MilestoneDraft = {
  title: string;
  amount: string;
  duration: string;
};

function emptyMilestone(): MilestoneDraft {
  return { title: "", amount: "", duration: "" };
}

export function SubmitProposalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const [coverLetter, setCoverLetter] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [availableToStart, setAvailableToStart] = useState("Immediately");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([emptyMilestone()]);
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>([""]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getJob(id)
      .then((data) => {
        if (!cancelled) setJob(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setJobError(err instanceof Error ? err.message : "Failed to load job");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const bidAmount = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const serviceFee = bidAmount * SERVICE_FEE_RATE;
  const payout = bidAmount - serviceFee;

  function updateMilestone(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function addMilestone() {
    setMilestones((prev) => [...prev, emptyMilestone()]);
  }

  function removeMilestone(index: number) {
    setMilestones((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function updatePortfolioLink(index: number, value: string) {
    setPortfolioLinks((prev) => prev.map((l, i) => (i === index ? value : l)));
  }

  function addPortfolioLink() {
    setPortfolioLinks((prev) => [...prev, ""]);
  }

  function removePortfolioLink(index: number) {
    setPortfolioLinks((prev) => prev.filter((_, i) => i !== index));
  }

  const validMilestones = milestones.filter((m) => m.title.trim() && Number(m.amount) > 0 && m.duration.trim());
  const canSubmit =
    !submitting &&
    !!id &&
    coverLetter.trim().length > 0 &&
    validMilestones.length === milestones.length &&
    milestones.length > 0 &&
    bidAmount > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setSubmitting(true);
    try {
      const milestoneInputs: SubmitProposalMilestoneInput[] = milestones.map((m) => ({
        title: m.title.trim(),
        amount: Number(m.amount),
        duration: m.duration.trim(),
      }));
      const links = portfolioLinks
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({ title: url, url }));

      await submitProposal(id, {
        cover_letter: coverLetter,
        bid_amount: bidAmount,
        estimated_duration: estimatedDuration.trim() || null,
        available_to_start: availableToStart.trim() || null,
        portfolio_links: links.length > 0 ? links : null,
        milestones: milestoneInputs,
      });
      navigate(`../${id}`, { relative: "path" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit proposal");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to=".."
        relative="path"
        className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        Back to job
      </Link>

      <PageHeader title="Submit a proposal" subtitle="Craft a compelling proposal secured by blockchain escrow." />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22.5rem]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Cover letter</h2>
              <p className="text-sm text-text-secondary">Introduce yourself and explain why you're the right fit.</p>
            </div>
            <Textarea
              label="Your message to the client"
              rows={5}
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              required
            />
          </Card>

          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Timeline</h2>
              <p className="text-sm text-text-secondary">Set expectations for delivery.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Estimated duration"
                placeholder="e.g. 4 weeks"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
              />
              <Input
                label="Available to start"
                placeholder="e.g. Immediately"
                value={availableToStart}
                onChange={(e) => setAvailableToStart(e.target.value)}
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Milestones</h2>
                <p className="text-sm text-text-secondary">Each milestone is released from escrow when approved.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addMilestone}>
                <Plus size={14} /> Add
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              {milestones.map((milestone, index) => (
                <div key={index} className="rounded-xl border border-border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Milestone {index + 1}
                    </p>
                    {milestones.length > 1 && (
                      <IconButton
                        aria-label={`Remove milestone ${index + 1}`}
                        onClick={() => removeMilestone(index)}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_10rem]">
                    <Input
                      className="min-w-0"
                      placeholder="Milestone title"
                      value={milestone.title}
                      onChange={(e) => updateMilestone(index, { title: e.target.value })}
                      required
                    />
                    <Input
                      className="min-w-0"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Amount"
                      value={milestone.amount}
                      onChange={(e) => updateMilestone(index, { amount: e.target.value })}
                      required
                    />
                    <Input
                      className="min-w-0"
                      placeholder="Duration"
                      value={milestone.duration}
                      onChange={(e) => updateMilestone(index, { duration: e.target.value })}
                      required
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-text-muted">
              Duration is a proposed timeline for the client's reference — it won't be tracked after the contract is
              created.
            </p>

            <div className="flex items-center justify-between rounded-lg bg-accent-subtle px-4 py-3 text-sm font-semibold text-accent">
              <span>Total bid</span>
              <span>{bidAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD</span>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Portfolio links</h2>
                <p className="text-sm text-text-secondary">Share relevant work samples.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addPortfolioLink}>
                <Plus size={14} /> Add link
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {portfolioLinks.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="https://"
                    value={url}
                    onChange={(e) => updatePortfolioLink(index, e.target.value)}
                  />
                  {portfolioLinks.length > 1 && (
                    <IconButton
                      aria-label={`Remove portfolio link ${index + 1}`}
                      onClick={() => removePortfolioLink(index)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-text-secondary">Proposal summary</p>
              {job && !jobError ? (
                <div className="mt-2 rounded-lg bg-surface-muted p-3">
                  <p className="text-xs text-text-secondary">Applying to</p>
                  <p className="mt-1 text-sm font-semibold text-text-primary">{job.title}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-text-muted">{jobError ?? "Loading job..."}</p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
              {job && (
                <div className="flex justify-between text-text-secondary">
                  <span>Client budget</span>
                  <span className="font-medium text-text-primary">{formatBudget(job.budget)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-secondary">
                <span>Your bid</span>
                <span className="font-medium text-text-primary">
                  {bidAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Service fee ({Math.round(SERVICE_FEE_RATE * 100)}%)</span>
                <span className="font-medium text-text-primary">
                  -{serviceFee.toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-text-primary">
                <span>You'll receive</span>
                <span className="text-success-text">
                  {payout.toLocaleString("en-US", { maximumFractionDigits: 2 })} HBD
                </span>
              </div>
            </div>

            {error && <p className="text-sm text-text-primary">{error}</p>}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              <Send size={16} /> {submitting ? "Submitting..." : "Submit Proposal"}
            </Button>

            <p className="text-xs text-text-muted">
              Payment is guaranteed by native Hive escrow. Funds release to your wallet as each milestone is
              approved.
            </p>
          </Card>
        </div>
      </form>
    </div>
  );
}
