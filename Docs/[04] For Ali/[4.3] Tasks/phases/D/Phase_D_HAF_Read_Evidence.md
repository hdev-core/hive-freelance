# Phase D — HAF read path evidence

> **Owner:** Ali · **Date:** 2026-07-30  
> **Closes:** Milestone 1 acceptance #1 (read Hive account/records via HAF)  
> **Path:** Local HAF-compatible Postgres (`hive_haf` / `hafd.*`) via `HAF_DATABASE_URL`  
> **Related:** [`[01] work plan`](./[01]%20Milestone_1_Hive_Layer_Work_Plan.md) · [`[03] HAF decision`](./[03]%20Phase_A_HAF_Decision.md)

---

## Plain language

The app can look up a Hive account and sample on-chain ops by **SQL against a HAF-shaped database**, not by reading the handmade `hive_records` table from the block listener.

This local DB is a **compatible projection** (same idea as HAF’s `hafd` schema). When shared Greateck HAF credentials arrive, point `HAF_DATABASE_URL` at that Postgres and adjust SQL if column names differ.

**Say out loud in demos:** “This response is HAF-sourced (`source: \"haf\"`), not the custom listener.”

---

## Schema map (local ↔ intended shared HAF)

| Local (M1 demo) | Intended shared HAF | Notes |
|-----------------|---------------------|--------|
| DB `hive_haf` | Shared HAF Postgres | Separate from app `hive_freelance` |
| Schema `hafd` | `hafd` (hive_fork_manager) | Compatible naming |
| `hafd.accounts` | `hafd.accounts` (or equivalent view) | `name`, `id`, metadata |
| `hafd.operations` | `hafd.operations` / ops views | Minimal columns for M1 |
| `hafd.account_operations` | account↔op link tables/views | Recent ops per account |

Not installed locally: full `hived`, `sql_serializer`, or `hive_fork_manager` extension.

---

## Setup (reproduce)

```bash
docker compose up -d
# Existing volumes: init scripts do not re-run — bootstrap explicitly:
npm run db:bootstrap-haf

# Ensure .env has (host port 5433 matches docker-compose):
# HAF_DATABASE_URL=postgresql://hive:hive@localhost:5433/hive_haf

npm run build:packages
npm run dev:api
```

### SQL sample

```bash
docker exec -it hive-freelance-db psql -U hive -d hive_haf -c "SELECT name FROM hafd.accounts ORDER BY name;"
```

Expected rows include: `alice`, `hfdemo`, `initminer`.

---

## API evidence

### Health

```bash
curl -s http://localhost:4000/api/v1/health/haf
```

Captured 2026-07-30:

```json
{"ok":true,"source":"haf","accountCount":3,"operationCount":3}
```

### Account + records

```bash
curl -s http://localhost:4000/api/v1/hive/accounts/hfdemo
```

Captured 2026-07-30 (truncated):

```json
{
  "source": "haf",
  "account": {
    "id": 2,
    "name": "hfdemo",
    "createdAt": "2026-01-15T12:00:00.000Z",
    "jsonMetadata": { "demo": true, "app": "hive-freelance" }
  },
  "operations": [
    { "id": 2, "blockNum": 1001, "opType": "transfer", "...": "..." },
    { "id": 1, "blockNum": 1000, "opType": "custom_json", "...": "..." }
  ]
}
```

### Edge checks

| Case | Expect | Captured |
|------|--------|----------|
| `GET .../accounts/nosuchuser999xyz` | 404 `NOT_FOUND` | `{"error":"Account @nosuchuser999xyz not found in HAF","code":"NOT_FOUND"}` |
| Missing / wrong `HAF_DATABASE_URL` | 503 on `/health/haf`; API process stays up | Documented behavior |
| Compare to `hive_records` | App DB cache is **not** this path | Separate DB `hive_haf` |

---

## Code pointers

| Piece | Path |
|-------|------|
| Schema + seed | `infra/haf-local/schema.sql` |
| Bootstrap (existing volume) | `npm run db:bootstrap-haf` → `infra/haf-local/bootstrap.mjs` |
| Reader | `packages/hive/src/haf.ts`, `hiveReadStore.ts` |
| API | `GET /api/v1/hive/accounts/:name`, `GET /api/v1/health/haf` |

---

## Status

- [x] D1 Local `hive_haf` + `hafd` schema + seed  
- [x] D2 `createHafReadStore` / `HiveReadStore`  
- [x] D3 API reads labeled `source: "haf"`  
- [x] D4 Local Dev + this evidence note  
- [x] D5 Listener demoted for M1 acceptance reads  
