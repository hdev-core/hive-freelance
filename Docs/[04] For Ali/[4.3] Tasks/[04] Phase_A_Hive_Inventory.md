# Phase A3 — Hive layer file inventory

> **Owner:** Ali · **Date:** 2026-07-27  
> **Purpose:** Keep / Change / Replace / Leave alone — grounded in the current repo  
> **HAF path assumption:** [`[03] Phase_A_HAF_Decision.md`](./[03]%20Phase_A_HAF_Decision.md)

---

## Legend

| Label | Meaning |
|-------|---------|
| **Keep** | Foundation for M1; reuse as-is or with small fixes |
| **Change** | Extend or adjust in Phases B–D |
| **Demote** | Keep running if needed, but **not** M1 HAF acceptance proof |
| **Leave alone** | Feature / escrow work — out of M1 scope |

---

## Keep (foundation)

| Path | Role today | Notes |
|------|------------|-------|
| `packages/hive/package.json` | Declares `@hiveio/wax` (no dhive) | Keep; add deps only if HAF client needs them |
| `packages/hive/src/chain.ts` | `createChain`, WAX init attempt, condenser reads | Keep; extend later for WAX tx helper (Phase C) |
| `packages/hive/src/kms.ts` | Local KMS signing stub | Keep (dry-run); no AWS KMS in M1 |
| `packages/hive/src/custodialVault.ts` | Custodial key holding | Keep for provisioner |
| `packages/hive/src/index.ts` | Package exports | Keep; export new `haf` / wax helpers when added |
| `packages/shared/src/index.ts` | `APP_ID`, escrow op names | Keep |
| `apps/api/src/lib/hiveAuth.ts` | Account lookup, Keychain sig verify, RC warning | Keep; verify in Phase B |
| `apps/api/src/lib/challengeStore.ts` | Single-use login challenges | Keep |
| `apps/api/src/routes/auth.ts` | `/challenge`, `/verify`, Google, claim | Keep |
| `apps/api/src/lib/devSeedSigner.ts` | Dev Keychain-style signer | Keep for local demos |
| `apps/web/src/pages/LoginPage.tsx` | Keychain login UI | Keep; smoke in Phase B |
| `apps/web/src/pages/KeychainCheckPage.tsx` | Extension + sign smoke | Keep; fix if broken (B2) |
| `apps/web/src/lib/keychain.ts` | `requestBroadcast` helper | Keep |
| `apps/provisioner/src/index.ts` | `account_create` + `delegateRc` stub | Keep; prove dry-run (Phase E) |
| `apps/api/src/routes/health.ts` | API / Hive health | Keep; add HAF/WAX probes later (C/D) |

---

## Change (Phases B–D)

| Path | What to change | Phase |
|------|----------------|-------|
| `packages/hive/src/` (new e.g. `waxTx.ts`) | WAX-built `custom_json` helper + mock/broadcast | C |
| `packages/hive/src/` (new e.g. `haf.ts`) | HAF SQL reader via `HAF_DATABASE_URL` | D |
| `packages/hive/src/index.ts` | Export new helpers | C/D |
| `packages/hive/src/chain.ts` | Prefer WAX for build path where possible; keep condenser fallback only if needed | C |
| `apps/api/src/routes/health.ts` (or new hive route) | Dev-only WAX demo + HAF account read | C/D |
| `apps/web/src/pages/KeychainCheckPage.tsx` | Align WAX Keychain provider vs raw `hive_keychain` | B |
| `.env.example` | Add `HAF_DATABASE_URL`; keep `PROVISIONER_LIVE`, etc. | D/E |
| `Docs/[02]/[04] Local_Development_Guide.md` | Document HAF reads + env | D/F |

---

## Demote (interim — not M1 HAF acceptance)

| Path | Role today | M1 rule |
|------|------------|---------|
| `apps/listener/src/index.ts` | Polls blocks → LIB | May keep for escrow sync; **do not** cite as HAF |
| `apps/listener/src/filter.ts` | Filters app/agent ops | Same |
| `apps/listener/src/paymentSync.ts` | Updates payments from escrow ops | Feature sync interim |
| DB `hive_records` / `listener_state` | Cache + cursor | App-side cache only; **not** HAF projection |

---

## Leave alone (feature logic — not M1)

| Path | Why leave |
|------|-----------|
| `apps/api/src/services/payments.ts` | Escrow payloads / confirms |
| `apps/api/src/services/agentEscrow.ts` | Agent auto-approve (feature path) |
| `apps/api/src/routes/payments.ts` | Escrow HTTP API |
| `apps/api/src/services/milestones.ts` | Milestone + `custom_json` payloads for product flow |
| `apps/api/src/services/proposals.ts` | Proposals / contract accept |
| `apps/web/src/pages/ContractPage.tsx` | Fund / Ratify / Release UI |
| `apps/web/src/pages/ContractsPage.tsx` | Contracts list |
| `apps/web/src/pages/JobsPage.tsx` | Jobs marketplace |
| Dispute / review stubs (`stubs.ts`) | Phase 2 |

Reuse Keychain/WAX from M1 later; do **not** expand these for Phase A–D acceptance.

---

## Dependency check (M1)

| Package | Expected |
|---------|----------|
| `@hiveio/wax` | Present (`packages/hive`, `apps/web`) |
| `@hiveio/wax-signers-keychain` | Present (`apps/web`) |
| `@hiveio/dhive` | Must **not** be a dependency |

---

## Next phase map

```text
Phase A (this inventory)  ✓
    ↓
Phase B — Keychain challenge verify + evidence
    ↓
Phase C — WAX custom_json build + mock/broadcast demo
    ↓
Phase D — HAF reader + API read via HAF_DATABASE_URL
    ↓
Phase E — RC stub confirmation
    ↓
Phase F — Docs / demo pack
```

## Done when (A3)

- [x] Keep / Change / Demote / Leave alone listed against real paths  
- [x] Listener marked demote for acceptance  
- [x] Feature files marked leave alone  
- [x] Next phase map clear
