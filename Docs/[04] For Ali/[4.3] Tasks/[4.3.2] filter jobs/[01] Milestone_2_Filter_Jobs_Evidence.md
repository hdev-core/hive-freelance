# Milestone 2 — Search / filter jobs (keyword, skill, budget)

> **Owner:** Ali  
> **Branch:** `feature/searching_and_filtering`  
> **Date:** 2026-08-12  
> **Depends on:** Jobs API + Job marketplace  
> **Acceptance:** Filtering narrows the job list correctly by keyword / skill / budget

---

## Task (Trello)

**Milestone 2. Search/filter jobs by keyword, skill, and budget range.**

- **Backend:** query params on `GET /jobs` (leverages the existing partial indexes on jobs).
- **Frontend:** filter/search UI on the marketplace.
- **Acceptance:** filtering narrows the job list correctly by keyword/skill/budget.
- **Suggested:** shared (backend query + frontend UI).

---

## What was done

### Already in place (before this work)

| Filter | API | UI |
|--------|-----|-----|
| Skill | `GET /api/v1/jobs?skill=` | Sidebar skill chips |
| Budget range | `GET /api/v1/jobs?budget_min=&budget_max=` | Sidebar budget radio ranges |
| Category | `GET /api/v1/jobs?category=` | Sidebar categories |

### Completed in this change

1. **Backend keyword param** — `GET /api/v1/jobs?keyword=`
   - Trimmed; empty ignored; max **100** characters (otherwise `400`)
   - Matches if **any** of:
     - `title` contains keyword (case-insensitive)
     - `description` contains keyword (case-insensitive)
     - `skills_required` has an **exact** skill token equal to the keyword
   - Combined with skill / budget / category via **AND**
   - Files: [`apps/api/src/routes/jobs.ts`](../../../../../apps/api/src/routes/jobs.ts), [`apps/api/src/services/jobs.ts`](../../../../../apps/api/src/services/jobs.ts)

2. **Frontend wired to the API**
   - Marketplace search box sends `keyword` to `listJobs` (no longer filters only the current page in the browser)
   - Uses `useDeferredValue` so typing does not spam the API on every keystroke
   - Files: [`apps/web/src/pages/JobsListPage.tsx`](../../../../../apps/web/src/pages/JobsListPage.tsx), [`apps/web/src/services/jobDetailService.ts`](../../../../../apps/web/src/services/jobDetailService.ts)

3. **No new DB migration** — public browse still benefits from existing indexes (e.g. `idx_jobs_status_open`). Keyword uses Prisma `contains` / array `has`.

### Query contract (public browse)

```http
GET /api/v1/jobs?keyword=react&skill=typescript&budget_min=1000&budget_max=2999.99&limit=50
```

| Param | Meaning |
|-------|---------|
| `keyword` | Free-text title / description / exact skill token |
| `skill` | Exact skill in `skills_required` |
| `budget_min` / `budget_max` | Inclusive budget range (HBD) |
| `category` | Exact category (sidebar) |
| Default status | `open` only (public list) |

---

## How to test on the interface

### 0. Pre-flight

```powershell
docker compose up -d
# Ensure root .env has DATABASE_URL + DIRECT_URL on localhost:5433
npm run db:migrate
npm run dev
```

Open the app (default): [http://localhost:5173](http://localhost:5173)

You need **at least a few open jobs** with different titles, skills, and budgets. Post jobs as a client, or use existing seed/test jobs.

### 1. Open the marketplace list

Either:

- Logged out / public: [http://localhost:5173/jobs](http://localhost:5173/jobs)  
- As freelancer: [http://localhost:5173/freelancer/jobs](http://localhost:5173/freelancer/jobs)

You should see the search box (“Search jobs by title or skill…”) and the left **Filter** sidebar (budget ranges + skills + categories).

### 2. Keyword (search box)

1. Type a word that appears in a job **title** (e.g. `React`) — the list should shrink to matching jobs.
2. Clear the box — full open list returns.
3. Type a word from a job **description**, or an exact **skill** name — matching jobs remain.
4. Type nonsense (`zzzznope`) — empty state: “No jobs match your filters right now.”

### 3. Skill (sidebar chips)

1. Click a skill chip (e.g. `typescript`).
2. List should show only jobs that require that skill.
3. Click the same chip again to clear.

### 4. Budget (sidebar ranges)

1. Pick **Under 1,000 HBD** — only low-budget jobs.
2. Pick **1,000 – 3,000**, **3,000 – 5,000**, or **5,000+** — list updates to that band.
3. Pick **Any** — budget filter clears.

### 5. Combined (acceptance)

1. Set a budget range **and** a skill **and** type a keyword.
2. Confirm the list only shows jobs that satisfy **all** active filters.
3. Clear filters one by one and confirm the list widens again.

### 6. Optional API check (same filters)

```powershell
Invoke-RestMethod "http://localhost:4000/api/v1/jobs?keyword=react&limit=50"
Invoke-RestMethod "http://localhost:4000/api/v1/jobs?skill=figma&limit=50"
Invoke-RestMethod "http://localhost:4000/api/v1/jobs?budget_max=999.99&limit=50"
```

---

## Done when

- [x] `keyword` query param on `GET /jobs`
- [x] Skill + budget still server-side
- [x] Marketplace UI drives all three from the API
- [ ] Demo’d on UI: keyword / skill / budget alone and together (your local check)
