# Phase A2 — HAF setup path decision

> **Owner:** Ali · **Date:** 2026-07-27  
> **Status:** Pending lead sign-off (Laure)  
> **Related:** [`[01] work plan`](./[01]%20Milestone_1_Hive_Layer_Work_Plan.md) Phase D · [`Tech_Stack.md`](../../[03]%20System_Architecture_Data_Model/[01]%20Tech_Stack.md)

---

## Decision (working assumption until Laure confirms)

**Chosen path for Milestone 1:**

App reads Hive account / on-chain records through a **HAF SQL reader** in `packages/hive` (e.g. `haf.ts`), connected via a dedicated env var:

```env
HAF_DATABASE_URL=postgresql://...
```

That URL points at either:

- a **shared Greateck HAF** PostgreSQL projection, or  
- a **local HAF Postgres** projection provided/documented by the team  

…not at our app DB’s `hive_records` table alone.

| Do | Don’t |
|----|--------|
| Query HAF projection tables with SQL for M1 acceptance reads | Claim M1 done using only `apps/listener` → `hive_records` |
| Keep app DB (`DATABASE_URL`) separate from HAF (`HAF_DATABASE_URL`) | Run a full own `hived` + multi-day replay on a laptop unless lead provides infra |
| Keep interim listener for escrow sync until replaced | Delete listener in Phase A |

---

## Alternatives considered

| Option | Pros | Cons | Verdict for M1 |
|--------|------|------|----------------|
| **A. Shared / local HAF via `HAF_DATABASE_URL` + SQL reader** | Matches task card; fork-aware reads; feasible if infra exists | Needs access credentials / connection docs | **Selected (default)** |
| **B. Full local hived + sql_serializer on laptop** | Complete control | Heavy setup / long replay; internship risk | Reject unless Laure provides turnkey compose |
| **C. Adapter interface only, no real HAF DB** | Unblocks coding shape | Does **not** satisfy “read via HAF” acceptance alone | Only as interim coding scaffold — escalate |
| **D. Keep custom listener forever** | Already coded | Explicitly against architecture card / Tech Stack | Reject for M1 acceptance |

---

## What we need from Laure

Please confirm or correct:

1. Is **`HAF_DATABASE_URL` → shared/local HAF Postgres** the accepted M1 path?
2. If yes: connection details / docs / who owns the HAF instance?
3. If no: which alternative (B/C) is in scope, and what counts as “evidence” for acceptance?

Reply can be a chat note; paste outcome here when signed off:

```text
Signed off by: ________
Date: ________
Final path: ________
Notes: ________
```

---

## How Phase D will use this

1. Add `HAF_DATABASE_URL` to `.env` / `.env.example`.
2. Implement `packages/hive` HAF reader (`getAccount`, sample ops/records).
3. Expose API read (e.g. health probe or `/api/v1/hive/accounts/:name`) **sourced from HAF**.
4. Document: **reads → HAF**; interim listener is not the acceptance path.

---

## Message draft for Laure (copy/paste)

> For Milestone 1 Hive foundation, I’m documenting this HAF path: the app will read accounts/records via SQL against a HAF Postgres projection using `HAF_DATABASE_URL` (shared Greateck or team-provided local projection). We will not treat the custom `apps/listener` + `hive_records` cache as M1 acceptance. Full local hived replay is out unless you provide infra. Can you confirm this path and share connection/docs if available?

---

## Status

- [x] Working assumption written  
- [ ] Laure / lead sign-off recorded above  
- [x] Phase D landed with local `HAF_DATABASE_URL` → `hive_haf` (see [`[08]`](./[08]%20Phase_D_HAF_Read_Evidence.md)); shared Greateck URL still optional when provided  
