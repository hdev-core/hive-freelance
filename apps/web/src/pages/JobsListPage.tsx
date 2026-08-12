import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader, Card, Select } from "../components/ui";
import { FilterSidebar, JobListCard, type BudgetRangeValue } from "../components/marketplace";
import { listJobs, type JobListItem } from "../services/jobDetailService";

/** Maps the range picker onto GET /jobs' real budget_min/budget_max filter.
 * ".99" upper bounds approximate the original mock's exclusive `< limit`
 * comparison — budget is a real Decimal(10,2) column, so an inclusive `lte`
 * needs a boundary just under the round number to behave the same way. */
function budgetRangeToQuery(range: BudgetRangeValue): { budget_min?: number; budget_max?: number } {
  switch (range) {
    case "any":
      return {};
    case "under-1000":
      return { budget_max: 999.99 };
    case "1000-3000":
      return { budget_min: 1000, budget_max: 2999.99 };
    case "3000-5000":
      return { budget_min: 3000, budget_max: 4999.99 };
    case "5000-plus":
      return { budget_min: 5000 };
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
  const [items, setItems] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const keyword = deferredSearch.trim() || undefined;
  const [category, setCategory] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [budgetRange, setBudgetRange] = useState<BudgetRangeValue>("any");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listJobs({
      category: category ?? undefined,
      skill: skill ?? undefined,
      keyword,
      ...budgetRangeToQuery(budgetRange),
      limit: 50,
    })
      .then((data) => {
        if (!cancelled) setItems(data.items);
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
  }, [category, skill, budgetRange, keyword]);

  // Derived from the currently loaded page, not a dedicated facets endpoint
  // (none exists) — same approach the old mock version used, just actually
  // scoped to what's on screen instead of the whole store regardless of
  // filters.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of items) {
      if (!job.category) continue;
      counts.set(job.category, (counts.get(job.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
  }, [items]);

  const skills = useMemo(() => {
    const set = new Set<string>();
    for (const job of items) {
      for (const s of job.skills_required ?? []) set.add(s);
    }
    return Array.from(set).sort();
  }, [items]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find your next contract"
        subtitle={`${items.length} job${items.length === 1 ? "" : "s"} match your filters · all payments escrow-protected`}
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

          {!loading && !error && items.length === 0 && (
            <Card className="py-12 text-center text-sm text-text-secondary">No jobs match your filters right now.</Card>
          )}

          {!loading &&
            !error &&
            items.map((job) => <JobListCard key={job.id} job={job} />)}
        </div>
      </div>
    </div>
  );
}
