/**
 * Mock data layer for the Jobs marketplace (M2 Frontend).
 *
 * Shape source of truth: docs/[03] System_Architecture_Data_Model/[03] Architecture_and_API.md
 * (Jobs section) and apps/api/src/{routes,services}/jobs.ts (read-only reference —
 * this file does not import from apps/api). The Jobs API itself is owned by
 * Laure/Ali and is not wired up yet, so every function here is backed by an
 * in-memory mock store with simulated network latency.
 *
 * Everything under the `mock` key on `MockJob` is NOT part of the `jobs` table
 * and has no real endpoint backing it yet — see the comments on `MockJobExtras`
 * below for exactly what's guessed and why.
 */

export type JobStatus = "open" | "in_progress" | "completed";

/** Matches JobRow from packages/db/src/types.ts exactly — this is the real API shape. */
export type JobRow = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  budget: string;
  category: string | null;
  skills_required: string[] | null;
  status: JobStatus;
  created_at: string;
  updated_at: string;
};

export type JobListResponse = {
  items: JobRow[];
  page: number;
  limit: number;
};

/** Matches the real GET /jobs/:id response — JobRow + proposalCount (camelCase, per apps/api/src/services/jobs.ts). */
export type JobDetailResponse = JobRow & {
  proposalCount: number;
};

/** Matches the real POST /jobs request body (zod schema in apps/api/src/routes/jobs.ts). */
export type CreateJobInput = {
  title: string;
  description: string;
  budget: number;
  category?: string;
  skills_required?: string[];
};

/**
 * Fields that do NOT exist on the `jobs` table. Flagging each one for
 * Laure/Ali to confirm the real shape before the Jobs/Payments/Profiles APIs
 * grow to expose them:
 *
 * - pricing_type: GUESS. `jobs.budget` is a single NUMERIC(10,2) column with
 *   no fixed/hourly distinction anywhere in the schema. The mockups show
 *   both "Fixed price" and "85 HBD/hr" — there is currently no field to
 *   carry that. Needs a real column (or a derived convention) before this
 *   stops being a guess.
 * - funding_status: from `payments.status` (`pending`→awaiting_funding,
 *   `escrowed`/`released`→escrow_funded is my mapping, not confirmed) —
 *   requires joining `payments` via `contracts`, which doesn't exist until
 *   a proposal is accepted. A still-open job with no contract yet has no
 *   real payments row at all, so "Escrow Funded" on an open job listing is
 *   itself a mockup concept with no backing data model today.
 * - proposal_count on the LIST view: the real GET /jobs/:id returns
 *   `proposalCount`, but GET /jobs (list) does not return a per-item count.
 *   Showing it on cards in the list is mocked purely for the mockup parity.
 * - client.*: `name`/`verified` have no columns on `users`/`profiles` today
 *   (no display_name, no is_verified). `rating`/`review_count` would be an
 *   aggregate over `reviews`, not precomputed anywhere. `total_spent` would
 *   be a SUM over `payments`, also not precomputed. All GUESSES.
 * - client.username: MISSING ENTIRELY — there's no Hive username on this
 *   mock, only the fake `client_id`. The real Profile pages (M2) route by
 *   username (`/client/profile/:username`), so "About the client" can't
 *   link to the poster's real profile until this object carries one.
 */
export type MockJobExtras = {
  pricing_type: "fixed" | "hourly";
  funding_status: "escrow_funded" | "awaiting_funding";
  proposal_count: number;
  client: {
    name: string;
    rating: number;
    review_count: number;
    location: string;
    total_spent: string;
    member_since: string;
    verified: boolean;
  };
};

export type MockJob = JobRow & { mock: MockJobExtras };

const NETWORK_DELAY_MS = 550;

/** Mock-only stand-in for the logged-in client's id — there's no auth session wired up yet. */
export const MOCK_CURRENT_CLIENT_ID = "mock-current-client";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StoredJob = Omit<JobRow, "created_at" | "updated_at"> & {
  mock: MockJobExtras;
  createdOffsetMs: number;
};

let nextId = 7;

const store: StoredJob[] = [
  {
    id: "1",
    client_id: "101",
    title: "Senior Smart Contract Auditor for DeFi Protocol",
    description:
      "We are launching a decentralized lending protocol and need a thorough security audit of our Solidity smart contracts before mainnet deployment. The scope includes reviewing lending pools, interest rate models, and liquidation logic. You should provide a detailed report of vulnerabilities with severity ratings and remediation recommendations.",
    budget: "6500.00",
    category: "Development",
    skills_required: ["Solidity", "Security Audit", "DeFi", "Hardhat", "Foundry"],
    status: "open",
    createdOffsetMs: 2 * 60 * 60 * 1000,
    mock: {
      pricing_type: "fixed",
      funding_status: "escrow_funded",
      proposal_count: 12,
      client: {
        name: "Meridian Labs",
        rating: 4.9,
        review_count: 47,
        location: "Singapore",
        total_spent: "182K HBD",
        member_since: "Mar 2021",
        verified: true,
      },
    },
  },
  {
    id: "2",
    client_id: "102",
    title: "Complete Brand Identity for Web3 Wallet Startup",
    description:
      "Looking for a talented brand designer to craft a full visual identity for our upcoming non-custodial wallet. Deliverables include logo suite, color system, typography guidelines, and a mini brand book. We value clean, trustworthy, modern aesthetics.",
    budget: "3200.00",
    category: "Design",
    skills_required: ["Branding", "Logo Design", "Figma", "Illustration"],
    status: "open",
    createdOffsetMs: 5 * 60 * 60 * 1000,
    mock: {
      pricing_type: "fixed",
      funding_status: "escrow_funded",
      proposal_count: 28,
      client: {
        name: "Nimbus Wallet",
        rating: 4.7,
        review_count: 19,
        location: "Berlin, DE",
        total_spent: "64K HBD",
        member_since: "Jan 2023",
        verified: true,
      },
    },
  },
  {
    id: "3",
    client_id: "103",
    title: "Build Analytics Dashboard in Next.js + TypeScript",
    description:
      "We need an experienced frontend engineer to build a real-time analytics dashboard consuming our REST API. Charts, filters, exportable reports, and responsive layouts required. Ongoing work available for the right person.",
    budget: "85.00",
    category: "Development",
    skills_required: ["Next.js", "TypeScript", "React", "Tailwind CSS", "Charts"],
    status: "open",
    createdOffsetMs: 24 * 60 * 60 * 1000,
    mock: {
      pricing_type: "hourly",
      funding_status: "awaiting_funding",
      proposal_count: 41,
      client: {
        name: "Ledgerline Analytics",
        rating: 4.8,
        review_count: 33,
        location: "Austin, US",
        total_spent: "97K HBD",
        member_since: "Jun 2022",
        verified: true,
      },
    },
  },
  {
    id: "4",
    client_id: "104",
    title: "Technical Whitepaper for Layer-2 Scaling Solution",
    description:
      "Seeking a technical writer with blockchain expertise to author a 20-page whitepaper explaining our rollup architecture, tokenomics, and governance model. Must translate complex concepts into clear, credible prose.",
    budget: "2400.00",
    category: "Writing",
    skills_required: ["Technical Writing", "Blockchain", "Tokenomics", "Research"],
    status: "open",
    createdOffsetMs: 26 * 60 * 60 * 1000,
    mock: {
      pricing_type: "fixed",
      funding_status: "escrow_funded",
      proposal_count: 9,
      client: {
        name: "Rollup Foundation",
        rating: 5,
        review_count: 8,
        location: "Zug, CH",
        total_spent: "41K HBD",
        member_since: "Oct 2023",
        verified: true,
      },
    },
  },
  {
    id: "5",
    client_id: "105",
    title: "Mobile App UI/UX for Crypto Savings Product",
    description:
      "Design an intuitive mobile experience for a crypto savings app targeting first-time users. We want the escrow and yield features to feel approachable and safe. Deliver high-fidelity screens and an interactive prototype.",
    budget: "4100.00",
    category: "Design",
    skills_required: ["UI/UX", "Mobile Design", "Figma", "Prototyping"],
    status: "open",
    createdOffsetMs: 2 * 24 * 60 * 60 * 1000,
    mock: {
      pricing_type: "fixed",
      funding_status: "escrow_funded",
      proposal_count: 22,
      client: {
        name: "Vaultly",
        rating: 4.6,
        review_count: 14,
        location: "Lisbon, PT",
        total_spent: "28K HBD",
        member_since: "Feb 2024",
        verified: false,
      },
    },
  },
  {
    id: "6",
    client_id: "106",
    title: "Growth Marketer for Blockchain SaaS Launch",
    description:
      "Own our go-to-market for a B2B blockchain analytics tool. Paid acquisition, content strategy, and community growth. Data-driven mindset essential. Show us campaigns you've scaled.",
    budget: "60.00",
    category: "Marketing",
    skills_required: ["Growth", "SEO", "Paid Ads", "Content Strategy"],
    status: "open",
    createdOffsetMs: 3 * 24 * 60 * 60 * 1000,
    mock: {
      pricing_type: "hourly",
      funding_status: "awaiting_funding",
      proposal_count: 17,
      client: {
        name: "ChainMetrics",
        rating: 4.5,
        review_count: 11,
        location: "Remote",
        total_spent: "15K HBD",
        member_since: "Aug 2024",
        verified: true,
      },
    },
  },
];

function hydrate(job: StoredJob): MockJob {
  const createdAt = new Date(Date.now() - job.createdOffsetMs);
  return {
    id: job.id,
    client_id: job.client_id,
    title: job.title,
    description: job.description,
    budget: job.budget,
    category: job.category,
    skills_required: job.skills_required,
    status: job.status,
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    mock: job.mock,
  };
}

/**
 * Mirrors GET /jobs exactly: `category` and `skill` are each a single value
 * (not arrays) per the real endpoint's query params, `status` defaults to
 * "open", and results are paginated the same way. Any filter that ISN'T
 * part of the real contract (free-text search, budget range, escrow-funded
 * toggle) must be applied by the caller as a client-side post-filter on the
 * returned items — see JobsListPage.
 */
export async function listJobs(
  params: {
    category?: string;
    skill?: string;
    status?: JobStatus;
    page?: number;
    limit?: number;
  } = {},
): Promise<JobListResponse & { items: MockJob[] }> {
  await delay(NETWORK_DELAY_MS);

  const status = params.status ?? "open";
  let results = store.filter((job) => job.status === status);
  if (params.category) results = results.filter((job) => job.category === params.category);
  if (params.skill) {
    results = results.filter((job) => (job.skills_required ?? []).includes(params.skill!));
  }

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;
  const paged = results.slice(offset, offset + limit).map(hydrate);

  return { items: paged, page, limit };
}

/** Mirrors GET /jobs/:id — throws if not found, same as the real endpoint's 404. */
export async function getJob(id: string): Promise<MockJob & { proposalCount: number }> {
  await delay(NETWORK_DELAY_MS);
  const job = store.find((j) => j.id === id);
  if (!job) throw new Error("Job not found");
  return { ...hydrate(job), proposalCount: job.mock.proposal_count };
}

/**
 * Mirrors POST /jobs's request/response contract exactly. `mockDisplay` is a
 * second, clearly-separate argument for the UI-only fields (pricing type)
 * that the real endpoint has no field for — it is never merged into the
 * payload that would be sent to the real API.
 */
export async function createJob(
  input: CreateJobInput,
  mockDisplay: { pricing_type: MockJobExtras["pricing_type"] } = { pricing_type: "fixed" },
): Promise<MockJob> {
  await delay(NETWORK_DELAY_MS);

  if (!input.title.trim()) throw new Error("Title is required");
  if (!input.description.trim()) throw new Error("Description is required");
  if (!(input.budget > 0)) throw new Error("Budget must be a positive number");

  const job: StoredJob = {
    id: String(nextId++),
    client_id: MOCK_CURRENT_CLIENT_ID,
    title: input.title,
    description: input.description,
    budget: input.budget.toFixed(2),
    category: input.category ?? null,
    skills_required: input.skills_required ?? null,
    status: "open",
    createdOffsetMs: 0,
    mock: {
      pricing_type: mockDisplay.pricing_type,
      funding_status: "awaiting_funding",
      proposal_count: 0,
      client: {
        name: "You",
        rating: 0,
        review_count: 0,
        location: "—",
        total_spent: "0 HBD",
        member_since: "New member",
        verified: false,
      },
    },
  };
  store.unshift(job);
  return hydrate(job);
}

/**
 * Mock-only helper (no real endpoint): jobs posted by the current mock
 * client, across every status. GET /jobs only supports filtering by a
 * single `status` value (defaults "open"), so a real "my jobs" dashboard
 * would need its own endpoint — this reads the mock store directly instead
 * of going through listJobs().
 */
export async function listMyJobs(): Promise<MockJob[]> {
  await delay(NETWORK_DELAY_MS);
  return store.filter((job) => job.client_id === MOCK_CURRENT_CLIENT_ID).map(hydrate);
}

/** Mock-only helper (no real endpoint): category facet counts for the filter sidebar. */
export function getCategoryFacets(): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const job of store) {
    if (job.status !== "open" || !job.category) continue;
    counts.set(job.category, (counts.get(job.category) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

/** Mock-only helper (no real endpoint): distinct skills across open jobs, for the skill chip list. */
export function getAllSkills(): string[] {
  const skills = new Set<string>();
  for (const job of store) {
    if (job.status !== "open") continue;
    for (const skill of job.skills_required ?? []) skills.add(skill);
  }
  return Array.from(skills).sort();
}
