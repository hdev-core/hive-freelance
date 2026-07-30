# Phase D HAF — Handoff report for Laure

> **From:** Ali (Milestone 1 Phase D)  
> **To:** Laure  
> **Date:** 2026-07-30  
> **Goal:** Connect shared / real HAF with minimal app changes  
> **Related:** [`[03] Phase_A_HAF_Decision.md`](./[03]%20Phase_A_HAF_Decision.md) · [`[08] Phase_D_HAF_Read_Evidence.md`](./[08]%20Phase_D_HAF_Read_Evidence.md) · [`[01] Work plan`](./[01]%20Milestone_1_Hive_Layer_Work_Plan.md)

---

## Executive summary

Milestone 1 needs the app to **read Hive accounts / on-chain records via HAF** (SQL over a HAF Postgres projection), not via the interim custom listener (`hive_records`).

Because shared Greateck HAF credentials were not available yet, Phase D shipped a **local HAF-compatible Postgres database** (`hive_haf` + schema `hafd`) with **seeded demo accounts**, plus a real SQL reader and API that already speak the intended shape (`HAF_DATABASE_URL`, `source: "haf"`).

**What is final:** connection pattern, reader interface, API routes, env var name.  
**What is temporary:** local DB contents, simplified `hafd` tables, demo seed data.  
**What you should do:** point `HAF_DATABASE_URL` at real HAF and adjust SQL in one file if table/column names differ.

---

## 1. What is temporary or mocked?

### Fake / demo-only

| Item | Why it is temporary |
|------|---------------------|
| Database `hive_haf` on the same Docker Postgres as the app | Not a real HAF server (`hived` + `sql_serializer` + `hive_fork_manager`) |
| Seed accounts `hfdemo`, `alice`, `initminer` | Hand-inserted demo rows, not chain-synced |
| Seed operations (fake `custom_json` / `transfer` bodies) | Invented payloads for offline demos |
| Local table columns (minimal subset) | Not a full HAF projection; missing fork manager, reversible tables, full op typing, etc. |

### What simulates future HAF (intentionally kept)

| Item | Intent |
|------|--------|
| Env var `HAF_DATABASE_URL` | Same switch for local → shared HAF |
| Schema name `hafd` | Aligns with official HAF core schema naming |
| Tables `hafd.accounts`, `hafd.operations`, `hafd.account_operations` | Stand-in for real HAF account/op tables or views |
| `HiveReadStore` interface + `createHafReadStore()` | Stable app API; SQL inside can change |
| API responses with `"source": "haf"` | Forces demos to prove HAF path, not listener |
| Separate URL from `DATABASE_URL` | App DB stays independent of chain projection |

### Placeholders / stubs (files)

| Path | Role |
|------|------|
| [`infra/haf-local/schema.sql`](../../../infra/haf-local/schema.sql) | **Temporary** local schema + seed |
| [`infra/haf-local/bootstrap.mjs`](../../../infra/haf-local/bootstrap.mjs) | **Temporary** local bootstrap helper |
| [`infra/haf-local/docker-init/01-create-hive-haf.sh`](../../../infra/haf-local/docker-init/01-create-hive-haf.sh) | **Temporary** first-volume Docker init |
| SQL strings inside [`packages/hive/src/haf.ts`](../../../packages/hive/src/haf.ts) | **Semi-final** — keep module; **replace queries** if real HAF columns differ |

**Not a stub:** the HTTP endpoints and package exports. They are meant to stay.

**Still interim (pre-existing, not Phase D “fake HAF”):** `apps/listener` → `hive_records` for escrow sync. That is **not** the M1 HAF acceptance path and was only demoted in docs/logs.

---

## 2. What must be replaced or updated when real HAF is ready?

### Database connection

1. Set production/staging `.env` (and secrets store) to the real HAF Postgres URL:

```env
HAF_DATABASE_URL=postgresql://USER:PASSWORD@HAF_HOST:PORT/HAF_DBNAME
```

2. Keep app DB unchanged:

```env
DATABASE_URL=...   # hive_freelance / Prisma — do not point this at HAF
```

3. Local Docker `hive_haf` can remain for offline demos, or be ignored once everyone uses shared HAF.

### Tables / schemas to verify and possibly update

Local M1 mapping (assumed):

| Local (today) | Likely real HAF | Action for Laure |
|---------------|-----------------|------------------|
| `hafd.accounts` (`id`, `name`, `created_at`, `json_metadata`) | Real `hafd.accounts` or documented view | Confirm exact columns; update SELECT list in `haf.ts` |
| `hafd.operations` (`id`, `block_num`, `trx_in_block`, `op_pos`, `op_type`, `body`, `timestamp`) | Real ops tables / views (names evolve in upstream HAF) | Confirm how to get op type + JSON body + block/time |
| `hafd.account_operations` | Account↔operation link / `account_operations` style table | Confirm join path for “recent ops for account X” |

**Assumption to verify:** real shared HAF exposes readable account + operation data under schema `hafd` (or provides stable views). If Greateck uses different view names, only the SQL in `packages/hive/src/haf.ts` needs to change—not the API routes.

### Functions / modules to modify

| Symbol | File | Change when real HAF lands |
|--------|------|----------------------------|
| `createHafReadStore` SQL | `packages/hive/src/haf.ts` | **Update queries** to match real tables/views |
| `getAccount` / `getRecentAccountOps` / `ping` | same | Keep signatures; fix SQL + row mappers |
| `HiveReadStore` | `packages/hive/src/hiveReadStore.ts` | **Keep** unless product needs richer fields |
| API handlers | `apps/api/src/routes/hive.ts`, `health.ts` | **Keep** unless response shape expands |
| `infra/haf-local/*` | local only | Optional: keep for laptop demos; not required in prod |

### Configuration

| Variable | Today | After real HAF |
|----------|--------|----------------|
| `HAF_DATABASE_URL` | `postgresql://hive:hive@localhost:5433/hive_haf` | Shared Greateck / team HAF URL |
| `DATABASE_URL` | App DB | Unchanged |
| Docker compose HAF mounts | Local init | Optional for prod; not used if URL is remote |

### Assumptions Laure should verify

1. Is **`HAF_DATABASE_URL` → shared/local HAF Postgres** still the accepted M1 path? (Phase A decision pending your sign-off in `[03]`.)
2. Exact **connection string**, network access (VPN / allowlist), and least-privilege DB role for the app.
3. Canonical **SQL** for:
   - lookup account by name
   - list recent operations for an account
   - health / sync lag (optional)
4. Whether local `hafd.*` column names are close enough, or we must map to different views.
5. Whether Keychain auth should eventually read accounts from HAF too (today auth still uses **condenser RPC** on purpose).

---

## 3. Files created or modified

### Created (new)

| Path | Purpose | Temporary or final? |
|------|---------|---------------------|
| `infra/haf-local/schema.sql` | Local `hafd` tables + demo seed | **Temporary** (local demo infra) |
| `infra/haf-local/bootstrap.mjs` | Create `hive_haf` + apply schema on existing Docker volumes | **Temporary** (local tooling) |
| `infra/haf-local/docker-init/01-create-hive-haf.sh` | First-volume Docker init for `hive_haf` | **Temporary** (local tooling) |
| `packages/hive/src/haf.ts` | SQL HAF reader (`createHafReadStore`, `isHafConfigured`) | **Final module**; SQL may be updated |
| `packages/hive/src/hiveReadStore.ts` | `HiveReadStore` interface + types | **Final** |
| `apps/api/src/routes/hive.ts` | `GET /api/v1/hive/accounts/:name` | **Final** |
| `Docs/[04] For Ali/[4.3] Tasks/[08] Phase_D_HAF_Read_Evidence.md` | Acceptance evidence | **Final** (docs) |
| `Docs/[04] For Ali/[4.3] Tasks/[09] Phase_D_HAF_Handoff_for_Laure.md` | This handoff | **Final** (docs) |

### Modified

| Path | Purpose | Temporary or final? |
|------|---------|---------------------|
| `docker-compose.yml` | Mount local HAF init scripts into Postgres | **Temporary local convenience** (harmless if unused remotely) |
| `.env.example` | Documents `HAF_DATABASE_URL` | **Final** pattern; local URL is example only |
| `package.json` | Script `db:bootstrap-haf` | **Temporary** local helper (can keep) |
| `packages/hive/package.json` | Adds `pg` dependency | **Final** |
| `packages/hive/src/index.ts` | Exports HAF reader | **Final** |
| `apps/api/src/index.ts` | Mounts `/api/v1/hive` | **Final** |
| `apps/api/src/routes/health.ts` | Adds `GET /api/v1/health/haf` | **Final** |
| `apps/listener/src/index.ts` | Startup log demotes listener for M1 reads | **Final** wording |
| `Docs/[02] Additional Docs/[04] Local_Development_Guide.md` | Local HAF setup + smoke curls | **Final** docs (local URL section is demo) |
| `Docs/[03]/[01] Tech_Stack.md` | Clarifies HAF M1 + local compatible path | **Final** |
| `Docs/[04]/[01] Milestone_1_Hive_Layer_Work_Plan.md` | Phase D marked done | **Final** |
| `Docs/[04]/[03] Phase_A_HAF_Decision.md` | Notes Phase D landed locally | **Final** (your sign-off still open) |
| `README.md` | Stack map mentions HAF reader | **Final** |

---

## 4. New functions, modules, and endpoints

| Name | Location | What it does | Keep or replace? |
|------|----------|--------------|------------------|
| `HiveReadStore` | `packages/hive/src/hiveReadStore.ts` | Interface: `getAccount`, `getRecentAccountOps`, `ping`, `close` | **Keep** |
| Types `HafAccount`, `HafOperation`, `HafPingResult` | same | Response DTOs for the reader | **Keep** (extend fields if needed) |
| `createHafReadStore()` | `packages/hive/src/haf.ts` | Opens `pg` pool on `HAF_DATABASE_URL`, runs parameterized SQL | **Keep**; update SQL for real schema |
| `isHafConfigured()` | same | True if env var set (no network call) | **Keep** |
| Internal mappers / `normalizeAccountName` | same | Row mapping + username normalize | **Keep** |
| `hiveRouter` | `apps/api/src/routes/hive.ts` | Express router under `/api/v1/hive` | **Keep** |
| `GET /api/v1/hive/accounts/:name` | same | Returns `{ source: "haf", account, operations }` or 404/503 | **Keep** |
| `GET /api/v1/health/haf` | `apps/api/src/routes/health.ts` | Pings HAF; returns counts + `source: "haf"` or 503 | **Keep** |
| `npm run db:bootstrap-haf` | root `package.json` → `bootstrap.mjs` | Local DB create/seed | **Local only**; not needed for shared HAF |

No new background worker and no change to Keychain auth path.

---

## 5. Least-work steps to connect real HAF

After your HAF Postgres is reachable:

1. **Confirm schema**  
   Document (or share) the exact SQL that returns:
   - one account by name  
   - recent ops for that account  
   - optional “is projection healthy / last block”

2. **Give the app a read-only connection string**  
   Set `HAF_DATABASE_URL` in the environment used by `apps/api` (and `.env.example` comments if the URL pattern changes).

3. **Diff local SQL vs real SQL**  
   Open [`packages/hive/src/haf.ts`](../../../packages/hive/src/haf.ts).  
   Update only the three queries in `getAccount`, `getRecentAccountOps`, and `ping` (and mappers if column names differ).  
   Do **not** need to rewrite routes if the TypeScript return types stay compatible.

4. **Rebuild packages and smoke-test**

```bash
npm run build -w @hive-freelance/hive
# restart API
curl -s http://localhost:4000/api/v1/health/haf
curl -s http://localhost:4000/api/v1/hive/accounts/<real_hive_username>
```

Expect `"source":"haf"` and real chain data (not `hfdemo` seed, unless that account exists on chain and in HAF).

5. **Optional cleanup**  
   - Leave `infra/haf-local` for offline intern demos, or remove mounts from `docker-compose.yml` if you prefer no local fake HAF.  
   - Update `[08]` evidence with a real-account curl once available.  
   - Sign off the blank block in [`[03] Phase_A_HAF_Decision.md`](./[03]%20Phase_A_HAF_Decision.md).

6. **Do not**  
   - Point `DATABASE_URL` at HAF.  
   - Delete the listener yet if escrow still relies on `hive_records` (separate follow-up).  
   - Switch Keychain `getHiveAccount` to HAF until posting-key / authority needs are confirmed.

---

## 6. Known limitations and TODOs

| Item | Status |
|------|--------|
| Not full HAF (`hived` / `sql_serializer` / `hive_fork_manager`) | Local compatible only |
| Seed data only (~3 accounts, ~3 ops) | Not chain-complete |
| No fork / irreversibility semantics in local DB | Real HAF should provide this |
| Pool created per API request | Fine for demo; consider shared pool later |
| Auth / challenge still condenser RPC | Intentional for M1 |
| Escrow confirmation still interim listener | Out of Phase D scope |
| Laure sign-off on A2 still pending in `[03]` | Needs your confirmation |
| Real shared URL / allowlist / credentials | Not in repo (by design) |
| Upstream HAF may rename/drop columns over time | Expect SQL maintenance in `haf.ts` |
| Local Dev previously mixed port 5432 vs 5433 | Docs corrected to host **5433** |

---

## Quick contact checklist for Laure

- [ ] Provide `HAF_DATABASE_URL` (or host + db + role)  
- [ ] Provide canonical account + ops SQL (or confirm local `hafd.*` mapping)  
- [ ] Confirm read-only role is enough for M1  
- [ ] Sign off Phase A path in `[03]`  
- [ ] After cutover: smoke `/api/v1/health/haf` + `/api/v1/hive/accounts/:name` on a real account  

Thank you — the app is shaped so real HAF is mostly **config + SQL**, not a rewrite.
