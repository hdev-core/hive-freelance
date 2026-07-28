import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader, Card, Select } from "../components/ui";
import { FilterSidebar, JobCard, type BudgetRangeValue } from "../components/marketplace";
import { getAllSkills, getCategoryFacets, listJobs, type MockJob } from "../services/jobsService";

function matchesBudgetRange(budget: number, range: BudgetRangeValue): boolean {
  switch (range) {
    case "any":
      return true;
    case "under-1000":
      return budget < 1000;
    case "1000-3000":
      return budget >= 1000 && budget < 3000;
    case "3000-5000":
      return budget >= 3000 && budget < 5000;
    case "5000-plus":
      return budget >= 5000;
  }
}

function JobCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="h-3 w-24 rounded bg-surface-muted" />
      <div className="mt-4 h-5 w-3/4 rounded bg-surface-muted" />
      <div className="mt-3 h-3 w-full rounded bg-surface-muted" />
      <div className="mt-2 h-3 w-2/3 rounded bg-surface-muted" />
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-16 rounded-full bg-surface-muted" />
        <div className="h-6 w-16 rounded-full bg-surface-muted" />
      </div>
    </Card>
  );
}

export function JobsListPage() {
  const [rawItems, setRawItems] = useState<MockJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [budgetRange, setBudgetRange] = useState<BudgetRangeValue>("any");
  const [escrowFundedOnly, setEscrowFundedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listJobs({ category: category ?? undefined, skill: skill ?? undefined, limit: 50 })
      .then((data) => {
        if (!cancelled) setRawItems(data.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load jobs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, skill]);

  const categories = useMemo(() => getCategoryFacets(), [rawItems]);
  const skills = useMemo(() => getAllSkills(), [rawItems]);

  const visibleItems = useMemo(() => {
    return rawItems.filter((job) => {
      if (escrowFundedOnly && job.mock.funding_status !== "escrow_funded") return false;
      if (!matchesBudgetRange(Number(job.budget), budgetRange)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const inTitle = job.title.toLowerCase().includes(q);
        const inSkills = (job.skills_required ?? []).some((s) => s.toLowerCase().includes(q));
        if (!inTitle && !inSkills) return false;
      }
      return true;
    });
  }, [rawItems, escrowFundedOnly, budgetRange, search]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find your next contract"
        subtitle={`${visibleItems.length} job${visibleItems.length === 1 ? "" : "s"} match your filters · all payments escrow-protected`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17.5rem_1fr]">
        <aside className="order-2 min-w-0 lg:order-1">
          <Card>
            <FilterSidebar
              categories={categories}
              selectedCategory={category}
              onSelectCategory={setCategory}
              budgetRange={budgetRange}
              onSelectBudgetRange={setBudgetRange}
              skills={skills}
              selectedSkill={skill}
              onSelectSkill={setSkill}
              escrowFundedOnly={escrowFundedOnly}
              onToggleEscrowFundedOnly={() => setEscrowFundedOnly((v) => !v)}
            />
          </Card>
        </aside>

        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs by title or skill..."
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-shadow duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-elevate"
              />
            </div>
            <Select defaultValue="recent" className="sm:w-48">
              <option value="recent">Most recent</option>
            </Select>
          </div>

          {error && (
            <div className="rounded-2xl border border-accent-subtle-border bg-accent-subtle p-6 text-sm text-text-primary">
              Couldn't load jobs: {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!loading && !error && visibleItems.length === 0 && (
            <Card className="py-12 text-center text-sm text-text-secondary">No jobs match your filters right now.</Card>
          )}

          {!loading &&
            !error &&
            visibleItems.map((job) => <JobCard key={job.id} job={job} />)}
        </div>
      </div>
    </div>
  );
}
