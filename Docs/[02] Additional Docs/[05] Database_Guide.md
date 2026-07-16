# 05 — Database Guide

**Project:** Hive Freelance Escrow Platform  
**Audience:** Developers working with PostgreSQL, migrations, and `@hive-freelance/db`

This document describes the **implemented** database: how it runs, how migrations are applied, what tables exist, and how they relate. The canonical design lives in [`[02] DB_Schema_and_ER_Diagram.md`](../[03]%20System_Architecture_Data_Model/[02]%20DB_Schema_and_ER_Diagram.md); this guide is the practical companion for the code in `packages/db`.

Related: [`[04] Local_Development_Guide.md`](./[04]%20Local_Development_Guide.md), root [`README.md`](../../README.md).

---

## Overview

| Concern | Choice |
|---------|--------|
| Engine | PostgreSQL 16 (Docker Compose) |
| Database name | `hive_freelance` |
| Access from apps | `DATABASE_URL` in `.env` |
| Migrations | Versioned SQL in `packages/db/migrations` |
| TypeScript types | `@hive-freelance/db` → `packages/db/src/types.ts` |
| ORM | None — raw `pg` pool + SQL |

Data is split into two layers:

- **Off-chain (PostgreSQL):** app source of truth for users, jobs, proposals, contracts, milestones, payments, reviews.
- **On-chain (Hive):** immutable escrow / reputation events; cached locally in `hive_records` for fast queries.

`hive_tx_id` columns on marketplace tables are **soft links** (plain `TEXT`) to `hive_records.hive_tx_id` — not enforced foreign keys.

---

## Connection

Default local credentials (from `docker-compose.yml` / `.env.example`):

| Field | Value |
|-------|--------|
| Host | `localhost` |
| Port | `5432` |
| Database | `hive_freelance` |
| User | `hive` |
| Password | `hive` |
| URL | `postgresql://hive:hive@localhost:5432/hive_freelance` |

```bash
# Start DB
docker compose up -d

# Interactive shell
docker exec -it hive-freelance-db psql -U hive -d hive_freelance
```

Use DBeaver, pgAdmin, TablePlus, or a Cursor/VS Code Postgres extension with the same connection for a GUI.

---

## Migrations

| File | What it creates |
|------|-----------------|
| [`001_bootstrap.sql`](../../packages/db/migrations/001_bootstrap.sql) | `schema_migrations`, `users`, `oauth_accounts`, `hive_records`, `listener_state` |
| [`002_marketplace_schema.sql`](../../packages/db/migrations/002_marketplace_schema.sql) | `profiles`, `jobs`, `proposals`, `contracts`, `milestones`, `payments`, `disputes`, `reviews` + `updated_at` triggers |

Runner: `packages/db/src/migrate.ts` — applies each `*.sql` once and records the filename in `schema_migrations`.

```bash
npm run db:migrate
```

Expected after a fresh migrate:

```text
001_bootstrap.sql
002_marketplace_schema.sql
```

Do **not** edit already-applied migration files on a shared DB. Add a new numbered file (e.g. `003_…sql`) for schema changes.

---

## Table inventory

| Table | Purpose |
|-------|---------|
| `users` | Canonical identity = `hive_username` (no password). `auth_type`: `keychain` \| `google` \| `claimed`. |
| `oauth_accounts` | Google `sub` → `users` mapping |
| `profiles` | 1:1 profile (bio, skills[], hourly_rate, …) |
| `jobs` | Client listings (`open` / `in_progress` / `completed`) |
| `proposals` | One bid per freelancer per job |
| `contracts` | Created when a proposal is accepted |
| `milestones` | Ordered fundable stages on a contract |
| `payments` | Escrow tracking; default currency **HBD** |
| `disputes` | Manual admin resolution path (not automated MVP disputes) |
| `reviews` | Mutual ratings after completion (immutable rows) |
| `hive_records` | Listener cache of chain ops (`APP_ID`, escrow, custom_json, …) |
| `listener_state` | Block cursor for the custom Hive listener |
| `schema_migrations` | Applied migration filenames |

### Intentionally not in MVP schema

Messages, notifications, skill/category junction tables, soft deletes — see the schema doc “What Was Intentionally Cut for MVP”.

---

## Relationships (simplified)

```text
users
  ├── profiles (1:1)
  ├── oauth_accounts (0..1)
  ├── jobs (as client)
  │     └── proposals (as freelancer)
  │           └── contracts (1:1 with accepted proposal)
  │                 ├── milestones
  │                 │     └── payments
  │                 ├── disputes
  │                 └── reviews
  └── contracts (also as freelancer)

hive_records  ←── soft link via hive_tx_id (proposals, contracts, milestones, payments, reviews)
```

```mermaid
erDiagram
  users ||--|| profiles : has
  users ||--o| oauth_accounts : maps
  users ||--o{ jobs : posts
  jobs ||--o{ proposals : receives
  proposals ||--|| contracts : becomes
  contracts ||--o{ milestones : has
  milestones ||--o{ payments : fundedBy
  contracts ||--o{ disputes : mayHave
  contracts ||--o{ reviews : generates
```

---

## Important status fields

| Table | Status / key values |
|-------|---------------------|
| `jobs.status` | `open`, `in_progress`, `completed` |
| `proposals.status` | `pending`, `accepted`, `rejected` |
| `contracts.status` | `active`, `completed`, `cancelled` — completion when both `completed_by_*` flags are true |
| `milestones.status` | `pending` → `funded` → `submitted` → `approved` → `released` |
| `payments.status` | `pending`, `awaiting_ratification`, `escrowed`, `released`, `refunded`, `disputed` |
| `payments.currency` | `HBD` (default), `HIVE` (opt-in) |
| `disputes.status` | `open`, `resolved` |

`awaiting_ratification` is a real Hive escrow protocol state between `escrow_transfer` and both parties’ / agent’s `escrow_approve`.

---

## Design conventions (as implemented)

- Primary keys: `BIGSERIAL`
- Strings: `TEXT` (not `VARCHAR(n)`)
- Timestamps: `TIMESTAMPTZ` with `now()` defaults
- Mutable tables: `created_at` + `updated_at`; `set_updated_at()` trigger keeps `updated_at` current
- `reviews` has no `updated_at` (append-only)
- Partial indexes on hot statuses (e.g. open jobs, pending milestones)
- GIN index on `hive_records.payload` (JSONB)

---

## Code package: `@hive-freelance/db`

| Export | Use |
|--------|-----|
| `getPool` / `pingDb` / `closePool` | Connection lifecycle |
| `upsertHiveRecord` / `markHiveRecordsConfirmed` | Listener writers |
| `getListenerCursor` / `setListenerCursor` | Block cursor |
| Row types (`UserRow`, `JobRow`, `PaymentRow`, …) | Typed API / service layers |

Apps import:

```ts
import { getPool, type JobRow, type PaymentStatus } from "@hive-freelance/db";
```

After changing `packages/db/src`, rebuild packages (`npm run build:packages` or via `npm run predev`).

---

## Useful SQL snippets

```sql
-- Tables + migrations
\dt
SELECT * FROM schema_migrations ORDER BY id;

-- Listener progress
SELECT * FROM listener_state;

-- Recent chain cache
SELECT hive_tx_id, operation_type, block_number, confirmed
FROM hive_records
ORDER BY id DESC
LIMIT 20;

-- Marketplace counts
SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM jobs) AS jobs,
  (SELECT count(*) FROM contracts) AS contracts,
  (SELECT count(*) FROM payments) AS payments;
```

---

## On-chain vs off-chain (quick map)

| Event | On-chain | Off-chain row |
|-------|----------|---------------|
| Contract created | `custom_json` | `contracts` |
| Funds locked | `escrow_transfer` | `payments` → `awaiting_ratification` |
| Ratified | `escrow_approve` | `payments` → `escrowed` |
| Milestone approved | `custom_json` | `milestones` → `approved` |
| Paid out | `escrow_release` | `payments` → `released` |
| Review | `custom_json` | `reviews` |

Full detail: schema doc § “What Lives On-Chain vs Off-Chain”.

---

## Resetting local data (destructive)

Only for a throwaway local database:

```bash
docker compose down -v    # removes the named volume
docker compose up -d
npm run db:migrate
```

This wipes all Postgres data and re-applies `001` + `002` from scratch.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `DATABASE_URL is not set` | Copy `.env.example` → `.env`; migrate loads root `.env` |
| Connection refused on `5432` | `docker compose ps` — is `hive-freelance-db` healthy? |
| Migration skipped unexpectedly | Row already in `schema_migrations`; add a new `003_*.sql` instead of editing old files |
| Types out of date in apps | Run `npm run build:packages` after changing `packages/db` |
