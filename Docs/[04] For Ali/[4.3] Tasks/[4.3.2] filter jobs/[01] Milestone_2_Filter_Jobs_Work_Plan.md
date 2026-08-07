# Milestone 2 — Search / filter jobs (keyword, skill, budget)

> **Owner:** Ali · **Folder:** `Docs/[04] For Ali/[4.3] Tasks/[4.3.2] filter jobs`  
> **Created:** 2026-08-07  
> **Card:** Search/filter jobs by keyword, skill, and budget range  
> **Depends on:** Jobs API + Job marketplace (already in repo)  
> **Suggested shape:** Shared — backend query params + frontend filter UI  

---

## 1. What this milestone is (plain language)

Freelancers must be able to **narrow the job list** so they only see relevant work.

Three filters are in scope:

| Filter | Plain meaning |
|--------|----------------|
| **Keyword** | Type words; match job **title** (and optionally description / skills text). |
| **Skill** | Pick a skill tag; only jobs that require that skill. |
| **Budget range** | Pick a min/max (or preset ranges); only jobs in that budget window. |

**Acceptance (official):** Filtering **narrows the job list correctly** by keyword / skill / budget.

This is **not** escrow, proposals, or new job-create UX. It is list + query only.

---

## 2. Brainstorm — what “correct” means

### Happy path

1. Marketplace loads open jobs (paginated).
2. User sets keyword and/or skill and/or budget.
3. UI calls **real** `GET /api/v1/jobs?...` with matching query params.
4. List updates to only matching jobs (server-side filter — not a fake client-only slice of mock data).
5. Clearing filters restores the full open list.

### Edge cases to respect

| Case | Expected |
|------|----------|
| Empty keyword | Ignore param (no filter). |
| Keyword with spaces / case | Case-insensitive; trim. |
| Skill not on any job | Empty list (200 + `items: []`), not 500. |
| `budget_min > budget_max` | **400** (already implemented). |
| Invalid budget (NaN / negative) | **400** (already implemented). |
| Combine keyword + skill + budget | AND logic (all must match). |
| Only open jobs by default | Keep `status=open` default unless product asks otherwise. |
| Pagination with filters | Filters apply on every page request. |

### Out of scope (park for later)

- Full-text search ranking / Postgres `tsvector` (nice-to-have if keyword feels weak).
- Multi-skill AND/OR pickers.
- Escrow-funded-only filter (mock field today — not a real job column).
- Sort options beyond “most recent” (API already `createdAt desc`).
- Facet endpoints (`GET /jobs/facets`) — optional; can derive skills from current page or a small dedicated helper later.
- Changing job create / edit forms.

---

## 3. Current code vs requirement (honest gap)

### Backend (`GET /api/v1/jobs`) — **mostly ready**

| Capability | Status today | Gap |
|------------|--------------|-----|
| `skill` | **Done** — `skillsRequired: { has }` | Exact match only; fine for M2 |
| `budget_min` / `budget_max` | **Done** — Prisma `budget: { gte, lte }` | Docs lag; UI not wired |
| `category`, `status`, `page`, `limit` | **Done** | Keep |
| **Keyword** (`q` / `search`) | **Missing** | Add ILIKE (or similar) on `title` (+ optional `description`) |
| Indexes | Partial `idx_jobs_status_open`; `client_id`, `status` | Card says “leverages existing partial indexes” — true for open list; keyword may stay sequential scan for MVP unless we add trigram later |

**Files:**  
`apps/api/src/routes/jobs.ts` · `apps/api/src/services/jobs.ts` · `packages/db/prisma/schema.prisma` · migration `..._add_constraints_and_triggers`

### Frontend marketplace — **UI exists, not on real API**

| Piece | Status today | Gap |
|-------|--------------|-----|
| `JobsListPage` | Search box + sidebar | Filters applied **client-side** on mock data |
| `FilterSidebar` | Category / skill / budget radios | Comments say budget has no API params — **stale** |
| `jobsService.ts` | **In-memory mock** | Must call real `GET /jobs` (or thin API wrapper) |
| Budget presets | `budgetRanges.ts` | Map presets → `budget_min` / `budget_max` query params |
| Escrow toggle | Mock-only | Leave UI but don’t claim M2 acceptance on it |

**Files:**  
`apps/web/src/pages/JobsListPage.tsx` · `apps/web/src/components/marketplace/*` · `apps/web/src/services/jobsService.ts` · `apps/web/src/api.ts`

### Docs

| Doc | Gap |
|-----|-----|
| `API_MVP_Guide.md` | Lists category/skill/status/page/limit — **omits budget_min/max** and keyword |
| Architecture “filterable by category/skills” | Add budget + keyword when done |

---

## 4. Target API contract (M2)

`GET /api/v1/jobs`

| Param | Type | Behavior |
|-------|------|----------|
| `q` | string (optional) | Trimmed; case-insensitive match on `title` (recommend also `description` OR). Alias doc name: “keyword”. |
| `skill` | string (optional) | Exact array membership (existing). |
| `budget_min` | number ≥ 0 (optional) | Existing. |
| `budget_max` | number ≥ 0 (optional) | Existing. |
| `category` | string (optional) | Existing (keep; sidebar already uses it). |
| `status` | enum (optional) | Default `open`. |
| `page` / `limit` | numbers | Existing. |

**Response shape (keep):** `{ items, page, limit }`  
Optional later: `total` for “N jobs match” — not required for acceptance if UI shows `items.length` honestly for the current page (prefer adding `total` if cheap via `count`).

**Budget preset → query mapping (frontend):**

| UI value | `budget_min` | `budget_max` |
|----------|--------------|--------------|
| `any` | omit | omit |
| `under-1000` | omit | `999.99` or `1000` exclusive → use `budget_max=999.99` **or** document `budget_max=1000` as inclusive under — pick one and test |
| `1000-3000` | `1000` | `3000` |
| `3000-5000` | `3000` | `5000` |
| `5000-plus` | `5000` | omit |

Align inclusive boundaries in tests so cards don’t flicker at edges.

---

## 5. How you should work (rules)

1. **One acceptance slice at a time** — keyword API → budget wiring → skill wiring → full UI on real API.
2. **Server is source of truth** — do not keep keyword/budget as client-only filters over a mock dump for acceptance demos.
3. **Prove with evidence** — curl + screenshot of marketplace after each phase.
4. **Don’t expand escrow / sort / multi-skill** unless the card changes.
5. Prefer branching from **merged `develop`** after M1 lands (or rebase onto latest `develop`).

---

## 6. Phased plan (do in order)

### Phase 0 — Align & spike (≤0.5 day)

| ID | Task | Done when |
|----|------|-----------|
| **0.1** | Re-read this plan + card + current `listJobs` / `JobsListPage` | Can explain gap in 2 minutes |
| **0.2** | Confirm branch base (`develop` after M1 merge) | Clean branch `feature/m2-jobs-filter` (or similar) |
| **0.3** | Seed / ensure ≥5 open jobs with varied titles, skills, budgets (DB or create via API) | Manual filter demos possible |

**Deliverable:** short note in this folder if seed approach differs (optional).

---

### Phase A — Backend keyword query (~0.5–1 day)

| ID | Task | Files | Done when |
|----|------|-------|-----------|
| **A1** | Add `q` (keyword) to route parse + `listJobs` | `routes/jobs.ts`, `services/jobs.ts` | `GET /jobs?q=logo` returns only matching open jobs |
| **A2** | Implement Prisma filter: `OR` of `title` / `description` `contains` + `mode: 'insensitive'` (Postgres) | `services/jobs.ts` | Case-insensitive; empty `q` ignored |
| **A3** | Keep AND with existing `skill` / budget / category | same | Combined curl works |
| **A4** | Edge: invalid budget still 400; unknown skill → empty list | manual | Documented in evidence |

**Index note:** Card says leverage existing partial open index — keep filtering `status = open` first. Do **not** block M2 on trigram/GIN unless keyword is unusably slow on demo data.

**Evidence:** curl snippets for `q`, `skill`, `budget_min`/`budget_max`, combined.

---

### Phase B — Wire frontend to real Jobs API (~1 day)

| ID | Task | Files | Done when |
|----|------|-------|-----------|
| **B1** | Replace mock `listJobs` path used by marketplace with `apiFetch('/api/v1/jobs?...')` | `jobsService.ts` or new `jobsApi.ts` | Network tab shows real API |
| **B2** | Pass `q`, `skill`, `budget_min`, `budget_max`, `category`, `page`, `limit` from page state | `JobsListPage.tsx` | Changing filters refetches |
| **B3** | Map `BUDGET_RANGES` → min/max params | `budgetRanges.ts` (+ helper) | Preset changes list via API |
| **B4** | Debounce keyword input (~300ms) so typing doesn’t spam | `JobsListPage.tsx` | Smooth UX |
| **B5** | Loading / empty / error states stay clear | same | Empty: “No jobs match your filters” |
| **B6** | Update stale FilterSidebar comments (budget **does** hit API) | `FilterSidebar.tsx` | Comments match reality |

**Mock policy:** Keep mock helpers for offline Storybook/dev only if needed; marketplace acceptance path must be live API. Escrow toggle: hide, disable, or leave clearly “demo-only” — **not** part of acceptance.

**Evidence:** screenshot of filters + Network request URL with params + matching cards.

---

### Phase C — Skills UX polish (small, ~0.5 day)

| ID | Task | Done when |
|----|------|-----------|
| **C1** | Skill chips still single-select → `skill=` query (already API-ready) | Selecting a skill refetches |
| **C2** | Skills list source: from returned jobs **or** static popular list for MVP | Chips usable with real data |
| **C3** | Clear skill / clear all filters control | One click resets |

If open jobs in DB have empty `skills_required`, seed data (Phase 0.3) is mandatory.

---

### Phase D — Docs, tests, evidence (~0.5 day)

| ID | Task | Done when |
|----|------|-----------|
| **D1** | Update `Docs/[02]…/API_MVP_Guide.md` — document `q`, `budget_min`, `budget_max` | Guide matches API |
| **D2** | Evidence pack in this folder: `[02] M2_Filter_Jobs_Evidence.md` | Curl + UI proof |
| **D3** | Optional: API integration test for `listJobs` filters | At least keyword + budget + skill |
| **D4** | Self-check against §7 acceptance | All boxes ticked |

---

### Phase E — PR / handoff (~0.5 day)

| ID | Task | Done when |
|----|------|-----------|
| **E1** | PR into `develop` with Trello card link | Reviewable |
| **E2** | Test plan in PR body (keyword / skill / budget / combined / clear) | Reviewer can reproduce |
| **E3** | Note: escrow filter / sort / FTS deferred | Scope respected |

---

## 7. Suggested daily order

```text
Day 1 morning:  Phase 0 + A (keyword API + curl proof)
Day 1 afternoon: Phase B start (real GET /jobs + budget params)
Day 2 morning:  Phase B finish + C (skills + clear filters)
Day 2 afternoon: Phase D evidence + docs → Phase E PR
```

Adjust if marketplace is still mock-only and needs more API auth/CORS smoke.

---

## 8. Definition of done (copy for PR / card)

- [ ] `GET /jobs` supports **keyword** (`q`) + existing **skill** + **budget_min/max**.
- [ ] Marketplace UI sends those params to the **real API** (not mock-only client filter).
- [ ] Combined filters use **AND** and narrow the list correctly.
- [ ] Clearing filters restores the default open-job list.
- [ ] Evidence: curl + UI screenshot attached in this folder.
- [ ] API guide documents the new/updated query params.
- [ ] No escrow/sort/FTS scope creep unless explicitly added to the card.

---

## 9. File map — touch vs leave alone

### Prefer changing

```text
apps/api/src/routes/jobs.ts
apps/api/src/services/jobs.ts
apps/web/src/pages/JobsListPage.tsx
apps/web/src/services/jobsService.ts   ← wire real API (or split jobsApi.ts)
apps/web/src/components/marketplace/FilterSidebar.tsx
apps/web/src/components/marketplace/budgetRanges.ts
Docs/[02] Additional Docs/[06] API_MVP_Guide.md
Docs/[04] For Ali/[4.3] Tasks/[4.3.2] filter jobs/   ← this plan + evidence
```

### Leave alone (for this card)

```text
apps/listener/
packages/hive/          ← Hive layer (M1)
escrow / payments / proposals flows
Job create forms (unless seeding only)
```

---

## 10. Risks & escalations

| Risk | Mitigation |
|------|------------|
| Marketplace still 100% mock; switching to API shows empty list | Seed open jobs; or temporary “dev seed” script |
| Keyword `contains` slow on large tables | M2 demo scale is fine; escalate FTS only if lead asks |
| Budget range inclusive/exclusive mismatch vs UI labels | Document mapping in evidence; add one edge-case test |
| Partial skill match (`React` vs `React Native`) | M2 = exact `has` for skill chip; keyword covers fuzzy title/desc |
| Waiting on M1 merge | Branch from latest `develop`; rebase if needed |

---

## 11. How to test (smoke)

### Backend

```bash
# keyword
curl -s "http://localhost:4000/api/v1/jobs?q=brand"

# skill
curl -s "http://localhost:4000/api/v1/jobs?skill=Figma"

# budget
curl -s "http://localhost:4000/api/v1/jobs?budget_min=1000&budget_max=3000"

# combined
curl -s "http://localhost:4000/api/v1/jobs?q=design&skill=Figma&budget_min=1000&budget_max=5000"
```

### Frontend

1. Open `/jobs` (or marketplace route).
2. Type keyword → list narrows; Network shows `q=`.
3. Select skill → `skill=` present.
4. Select budget preset → `budget_min` / `budget_max` present.
5. Combine all three → list is intersection.
6. Clear filters → broad open list returns.

---

## 12. One-line standup template

> “M2 job filters: keyword API [ ] / budget UI→API [ ] / skill UI→API [ ] / evidence [ ] — blocker: ___.”

---

## 13. Architecture sketch (target)

```text
Browser JobsListPage
   │  q, skill, budget_min, budget_max, category, page
   ▼
GET /api/v1/jobs
   ▼
listJobs() → Prisma where:
   status = open
   AND title/description ILIKE %q%     (new)
   AND skills_required has skill       (existing)
   AND budget between min/max          (existing)
   ▼
{ items, page, limit }
```

Partial index `idx_jobs_status_open` helps the common `status = 'open'` path; filters stack on top.

---

## 14. Status

- [x] Plan written (this file)
- [ ] Phase 0–E implementation
- [ ] Evidence pack
- [ ] PR to `develop`
