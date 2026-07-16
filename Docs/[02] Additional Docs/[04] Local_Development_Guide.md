# 04 — Local Development Guide

**Project:** Hive Freelance Escrow Platform  
**Audience:** Developers running the monorepo on a laptop

This document explains how the stack runs locally: what lives in Docker, what runs on your machine, how to open the app UI, and how to inspect PostgreSQL.

Related: root [`README.md`](../../README.md), [`[01] Tech_Stack.md`](../[03]%20System_Architecture_Data_Model/[01]%20Tech_Stack.md), [`[05] Database_Guide.md`](./[05]%20Database_Guide.md), [`[06] API_MVP_Guide.md`](./[06]%20API_MVP_Guide.md), [`[07] Auth_Guide.md`](./[07]%20Auth_Guide.md).

---

## What runs where

| Piece | Where it runs | Notes |
|-------|----------------|-------|
| **PostgreSQL** | **Docker only** | Database `hive_freelance` on port `5432` |
| **API** (`apps/api`) | **Local Node** | Express on port **4000** |
| **Web UI** (`apps/web`) | **Local Node (Vite)** | React on port **5173** |
| **Listener** (`apps/listener`) | **Local Node** | Polls Hive blocks, writes `hive_records` |
| **Provisioner** (`apps/provisioner`) | **Library** (not its own HTTP server) | Invoked by the API for Google → Hive account creation |
| **Hive blockchain** | **Public internet** | Default node `https://api.hive.blog` — not in Docker |

**Summary:** Only the database is in Docker. Application code runs on your machine via `npm run dev`. Hive is a remote public API node.

```text
Browser (you)
   │
   ├─► http://localhost:5173     React UI (local)
   │
   └─► http://localhost:4000     API (local)
            │
            ├─► localhost:5432   Postgres (Docker)
            └─► api.hive.blog    Hive chain (remote)

Listener (local Node process)
   ├─► api.hive.blog             read blocks
   └─► localhost:5432            write hive_records
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

# 2. Start database container
docker compose up -d

# 3. Install deps + apply SQL migrations
npm install
npm run db:migrate

# 4. Start API + web + listener
npm run dev
```

`npm run dev` builds shared packages first (`predev`), then starts three processes together.

### Useful URLs

| What | URL |
|------|-----|
| App UI | [http://localhost:5173](http://localhost:5173) |
| Keychain check | [http://localhost:5173/keychain](http://localhost:5173/keychain) |
| API health (DB + process) | [http://localhost:4000/health](http://localhost:4000/health) |
| Hive health (chain + WAX) | [http://localhost:4000/api/v1/health/hive](http://localhost:4000/api/v1/health/hive) |

### Connection string

Apps read Postgres from `.env`:

```env
DATABASE_URL=postgresql://hive:hive@localhost:5432/hive_freelance
```

These match `docker-compose.yml` defaults:

| Field | Value |
|-------|--------|
| Host | `localhost` |
| Port | `5432` |
| Database | `hive_freelance` |
| User | `hive` |
| Password | `hive` |

---

## Scripts cheat sheet

| Command | What it does |
|---------|----------------|
| `docker compose up -d` | Start Postgres container in the background |
| `docker compose down` | Stop containers (data volume kept unless you remove it) |
| `npm run db:migrate` | Apply SQL files under `packages/db/migrations` |
| `npm run dev` | API + web + listener |
| `npm run dev:api` | API only |
| `npm run dev:web` | Web only |
| `npm run dev:listener` | Listener only |
| `npm run build` | Build all workspaces |

---

## Viewing the database (UI)

Docker does **not** ship a database admin UI by default. Use any Postgres client against `localhost:5432`.

### Option A — Desktop client (recommended)

Tools: **DBeaver**, **pgAdmin**, **TablePlus**, **DataGrip**, etc.

Create a connection with the same credentials as above (`hive` / `hive` / `hive_freelance`).

### Option B — Editor extension

In VS Code / Cursor, install a PostgreSQL / Database Client extension and add the same connection.

### Option C — CLI inside Docker

```bash
docker exec -it hive-freelance-db psql -U hive -d hive_freelance
```

Useful commands inside `psql`:

```sql
\dt                          -- list tables
SELECT * FROM schema_migrations;
SELECT * FROM listener_state;
SELECT * FROM hive_records ORDER BY id DESC LIMIT 20;
```

### Optional later: pgAdmin in Compose

A `pgadmin` service can be added to `docker-compose.yml` so a browser UI is available (e.g. `http://localhost:5050`) without installing a desktop client. Not included in the MVP scaffold.

---

## What’s in the DB after migrate

After `001_bootstrap.sql` + `002_marketplace_schema.sql` (`npm run db:migrate`):

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
| `hive_records` | Cached on-chain ops from the listener |
| `listener_state` | Last processed block cursor |
| `schema_migrations` | Which migration files have been applied |

Intentionally deferred (MVP cuts): messages, notifications, skill/category junction tables.

Schema source: [`[02] DB_Schema_and_ER_Diagram.md`](../[03]%20System_Architecture_Data_Model/[02]%20DB_Schema_and_ER_Diagram.md).

---

## Mental model

- **Docker** = always-on local database  
- **`npm run dev`** = three Node processes: UI, API, chain listener  
- **Hive** = real blockchain over the network  
- **React app** = product UI (not a DB admin)  
- **DBeaver / pgAdmin / etc.** = how you inspect Postgres  

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API `db: down` or migrate fails | `docker compose ps` — is `hive-freelance-db` healthy? Is `.env` `DATABASE_URL` correct? |
| Port 5432 already in use | Another Postgres on the host; stop it or change the Compose port mapping |
| Hive health fails | Network access to `HIVE_API_NODE`; try opening the URL / health endpoint again |
| Web can’t reach API | Confirm API is on `4000`; Vite proxies `/health` and `/api`, or set `VITE_API_BASE_URL` |
| Keychain page says not detected | Install [Hive Keychain](https://hive-keychain.com/) and reload the page |

---

## Secrets reminder

- Do not commit `.env` or real Hive active keys.
- `KMS_MODE=local` uses env stubs only (`LOCAL_AGENT_ACTIVE_KEY`, etc.).
- Production must use KMS/HSM for the agent account and custodial Google-user keys.
