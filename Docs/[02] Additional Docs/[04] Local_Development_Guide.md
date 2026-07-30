# 04 — Local Development Guide

**Project:** Hive Freelance Escrow Platform  
**Audience:** Developers running the monorepo on a laptop

This document explains how the stack runs locally: what lives in Docker, what runs on your machine, how to open the app UI, and how to inspect PostgreSQL.

Related: root [`README.md`](../../README.md), [`[01] Tech_Stack.md`](../[03]%20System_Architecture_Data_Model/[01]%20Tech_Stack.md), [`[05] Database_Guide.md`](./[05]%20Database_Guide.md), [`[06] API_MVP_Guide.md`](./[06]%20API_MVP_Guide.md), [`[07] Auth_Guide.md`](./[07]%20Auth_Guide.md).

---

## What runs where

| Piece | Where it runs | Notes |
|-------|----------------|-------|
| **PostgreSQL (app)** | **Docker** | Database `hive_freelance` on host port **5433** |
| **PostgreSQL (HAF local)** | **Same Docker container** | Database `hive_haf` (`hafd` schema) — Milestone 1 read path |
| **API** (`apps/api`) | **Local Node** | Express on port **4000** |
| **Web UI** (`apps/web`) | **Local Node (Vite)** | React on port **5173** |
| **Listener** (`apps/listener`) | **Local Node** | Interim escrow sync → `hive_records` (**not** M1 HAF acceptance) |
| **Provisioner** (`apps/provisioner`) | **Library** (not its own HTTP server) | Invoked by the API for Google → Hive account creation |
| **Hive blockchain** | **Public internet** | Default node `https://api.hive.blog` — not in Docker |

**Summary:** Only Postgres is in Docker (app DB + local HAF-compatible DB). Application code runs on your machine via `npm run dev`. Chain RPC is remote; **account/record acceptance reads go to HAF SQL**.

```text
Browser (you)
   │
   ├─► http://localhost:5173     React UI (local)
   │
   └─► http://localhost:4000     API (local)
            │
            ├─► localhost:5433 / hive_freelance   app Postgres
            ├─► localhost:5433 / hive_haf         HAF-compatible reads (M1)
            └─► api.hive.blog                    Hive RPC (auth / escrow interim)

Listener (local Node process)
   ├─► api.hive.blog             read blocks
   └─► localhost:5433            write hive_records (interim only)
```

---

## Prerequisites

- Node.js 20+
- Docker Desktop (or equivalent) for Postgres
- Optional: Hive Keychain browser extension (for the Keychain smoke page)

---

## Typical local flow

```bash
# 1. Env (once)
cp .env.example .env
# Ensure HAF_DATABASE_URL=postgresql://hive:hive@localhost:5433/hive_haf

# 2. Start database container
docker compose up -d

# 3. Install deps + apply SQL migrations + HAF local schema
npm install
npm run db:migrate
npm run db:bootstrap-haf

# 4. Start API + web + listener
npm run dev
```

`npm run dev` builds shared packages first (`predev`), then starts three processes together.

Fresh Docker volumes also run `infra/haf-local/docker-init` on first start. **Existing volumes** need `npm run db:bootstrap-haf` (init scripts do not re-run).

### Useful URLs

| What | URL |
|------|-----|
| App UI | [http://localhost:5173](http://localhost:5173) |
| Keychain check | [http://localhost:5173/keychain](http://localhost:5173/keychain) |
| API health (DB + process) | [http://localhost:4000/health](http://localhost:4000/health) |
| Hive health (chain + WAX) | [http://localhost:4000/api/v1/health/hive](http://localhost:4000/api/v1/health/hive) |
| HAF health (SQL projection) | [http://localhost:4000/api/v1/health/haf](http://localhost:4000/api/v1/health/haf) |
| HAF account demo | [http://localhost:4000/api/v1/hive/accounts/hfdemo](http://localhost:4000/api/v1/hive/accounts/hfdemo) |

### Connection strings

Apps read Postgres from `.env`:

```env
DATABASE_URL=postgresql://hive:hive@localhost:5433/hive_freelance
HAF_DATABASE_URL=postgresql://hive:hive@localhost:5433/hive_haf
```

These match `docker-compose.yml` defaults (host port **5433** → container 5432):

| Field | App DB | HAF local |
|-------|--------|-----------|
| Host | `localhost` | `localhost` |
| Port | `5433` | `5433` |
| Database | `hive_freelance` | `hive_haf` |
| User / password | `hive` / `hive` | `hive` / `hive` |
| Schema | public (Prisma) | `hafd` |

### HAF smoke (Milestone 1)

```bash
curl -s http://localhost:4000/api/v1/health/haf
curl -s http://localhost:4000/api/v1/hive/accounts/hfdemo
docker exec -it hive-freelance-db psql -U hive -d hive_haf -c "SELECT name FROM hafd.accounts;"
```

Responses must include `"source":"haf"`. Do **not** treat `hive_records` as the acceptance read path. Evidence: [`[08] Phase_D_HAF_Read_Evidence.md`](../[04]%20For%20Ali/[4.3]%20Tasks/[08]%20Phase_D_HAF_Read_Evidence.md).

### Provisioning / RC stub (Milestone 1)

Google account provisioning **dry-runs** `account_create` + RC delegation (`delegate_vesting_shares`) by default. Do **not** set live flags for routine local demos (mainnet cost).

| Variable | Default | Notes |
|----------|---------|--------|
| `PROVISIONER_LIVE` | `false` | When `true`, broadcasts against mainnet via `PROVISIONER_CREATOR_ACCOUNT` |
| `HIVE_RC_DELEGATION_VESTS` | `10.000000 VESTS` | Amount used only in live mode |
| `ENABLE_DEV_AUTH_ROUTES` | `false` | Must be `true` (and non-production) for `POST /api/v1/auth/dev-google` |

Details: [`[07] Auth_Guide.md`](./[07]%20Auth_Guide.md). Evidence: [`[10] Phase_E_RC_Stub_Evidence.md`](../[04]%20For%20Ali/[4.3]%20Tasks/[10]%20Phase_E_RC_Stub_Evidence.md).

Quick prove (also `node scripts/smoke-rc-dry-run.mjs`):

```bash
# API with ENABLE_DEV_AUTH_ROUTES=true and PROVISIONER_LIVE=false
curl -s -X POST http://localhost:4000/api/v1/auth/dev-google ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"demo-$(RANDOM)@example.com\",\"role\":\"client\"}"
# Expect API log: [provisioner] dry-run delegate_vesting_shares (RC) for @…
```

---

## Scripts cheat sheet

| Command | What it does |
|---------|----------------|
| `docker compose up -d` | Start Postgres container in the background |
| `docker compose down` | Stop containers (data volume kept unless you remove it) |
| `npm run db:migrate` | Apply Prisma migrations for the app DB |
| `npm run db:bootstrap-haf` | Create `hive_haf` + `hafd` schema/seed (safe on existing volumes) |
| `npm run dev` | API + web + listener |
| `npm run dev:api` | API only |
| `npm run dev:web` | Web only |
| `npm run dev:listener` | Listener only |
| `npm run build` | Build all workspaces |

---

## Viewing the database (UI)

Docker does **not** ship a database admin UI by default. Use any Postgres client against `localhost:5433`.

### Option A — Desktop client (recommended)

Tools: **DBeaver**, **pgAdmin**, **TablePlus**, **DataGrip**, etc.

Create a connection with the same credentials as above (`hive` / `hive` / `hive_freelance` or `hive_haf`).

### Option B — Editor extension

In VS Code / Cursor, install a PostgreSQL / Database Client extension and add the same connection.

### Option C — CLI inside Docker

```bash
docker exec -it hive-freelance-db psql -U hive -d hive_freelance
docker exec -it hive-freelance-db psql -U hive -d hive_haf
```

Useful commands inside `psql` (app DB):

```sql
\dt                          -- list tables
SELECT * FROM listener_state;
SELECT * FROM hive_records ORDER BY id DESC LIMIT 20;
```

Useful commands inside `psql` (HAF local):

```sql
SET search_path TO hafd;
SELECT * FROM accounts;
SELECT * FROM operations ORDER BY id DESC LIMIT 20;
```

### Optional later: pgAdmin in Compose

A `pgadmin` service can be added to `docker-compose.yml` so a browser UI is available (e.g. `http://localhost:5050`) without installing a desktop client. Not included in the MVP scaffold.

---

## What’s in the DB after migrate

After Prisma migrate (`npm run db:migrate`) on **app** DB `hive_freelance`:

| Table | Purpose |
|-------|---------|
| `users` | Hive identity (`hive_username`, `auth_type`, …) |
| `oauth_accounts` | Google ↔ user mapping |
| `profiles` | Per-user bio, skills, rates |
| `jobs` | Client job listings |
| `proposals` | Freelancer bids on jobs |
| `contracts` | Accepted proposal → active engagement |
| `milestones` | Fundable stages within a contract |
| `payments` | Escrow payment rows (HBD default) |
| `disputes` | Manual admin escrow dispute / resolution |
| `reviews` | Mutual ratings after completion |
| `hive_records` | Interim cached ops from the listener (not M1 HAF acceptance) |
| `listener_state` | Last processed block cursor |
| `schema_migrations` | Which migration files have been applied |

After `npm run db:bootstrap-haf` on **HAF** DB `hive_haf`:

| Object | Purpose |
|--------|---------|
| `hafd.accounts` | HAF-compatible account projection |
| `hafd.operations` | Sample ops |
| `hafd.account_operations` | Account ↔ op links |

Intentionally deferred (MVP cuts): messages, notifications, skill/category junction tables.

Schema source: [`[02] DB_Schema_and_ER_Diagram.md`](../[03]%20System_Architecture_Data_Model/[02]%20DB_Schema_and_ER_Diagram.md).

---

## Mental model

- **Docker** = always-on local Postgres (app + HAF-compatible DBs)  
- **`npm run dev`** = three Node processes: UI, API, interim chain listener  
- **HAF SQL** = Milestone 1 way to **read** accounts/records (`HAF_DATABASE_URL`)  
- **Hive RPC** = still used for Keychain auth / some escrow paths  
- **React app** = product UI (not a DB admin)  
- **DBeaver / pgAdmin / etc.** = how you inspect Postgres  

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API `db: down` or migrate fails | `docker compose ps` — is `hive-freelance-db` healthy? Is `.env` `DATABASE_URL` on port **5433**? |
| HAF health 503 | Run `npm run db:bootstrap-haf`; set `HAF_DATABASE_URL` to `.../hive_haf` |
| `dev-google` 404 | Set `ENABLE_DEV_AUTH_ROUTES=true` and ensure `NODE_ENV` is not `production` |
| Unexpected mainnet provision | Confirm `PROVISIONER_LIVE=false` (default); never flip LIVE for routine demos |
| Port 5433 already in use | Another process on the host; stop it or change the Compose port mapping |
| Hive health fails | Network access to `HIVE_API_NODE`; try opening the URL / health endpoint again |
| Web can’t reach API | Confirm API is on `4000`; Vite proxies `/health` and `/api`, or set `VITE_API_BASE_URL` |
| Keychain page says not detected | Install [Hive Keychain](https://hive-keychain.com/) and reload the page |

---

## Secrets reminder

- Do not commit `.env` or real Hive active keys.
- `KMS_MODE=local` uses env stubs only (`LOCAL_AGENT_ACTIVE_KEY`, etc.).
- Production must use KMS/HSM for the agent account and custodial Google-user keys.
