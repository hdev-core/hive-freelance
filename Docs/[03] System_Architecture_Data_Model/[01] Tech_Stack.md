# 01 — Tech Stack Decision
**Project:** Hive Freelance Escrow Platform   
**Phase:** Planning - System Architecture & Data Model 

> **Greateck standard:** WAX (`@hiveio/wax`) for transaction building/signing and HAF for chain data indexing. This doc follows that standard and documents trade-offs where MVP constraints apply.

---

## Decision Summary

The stack was selected against three criteria: fit with Hive's ecosystem and Greateck's standards, team familiarity within a 1.5–2 month delivery window, and ability to support the on-chain escrow flow that differentiates this platform from a standard freelance marketplace.

---

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | `React (TypeScript)` | Industry standard for dashboards. `@hiveio/signers-keychain` (WAX companion) handles Keychain browser integration for native Hive users. Google OAuth users bypass Keychain entirely — their transactions are signed server-side via KMS (see Provisioning Service row). |
| Backend | `Node.js + Express` | Matches the frontend JS/TS ecosystem. `@hiveio/wax` runs natively in Node. Handles agent-side signing (escrow approve, provisioning ops). |
| Database | `PostgreSQL` | Highly relational data model with strict FK integrity, especially around escrow state changes. Supports JSONB for caching Hive operation payloads. |
| Blockchain (tx) | `@hiveio/wax` | Greateck standard. Multi-language OO library using the same C++ protocol code as Hive core — always protocol-compatible. Replaces `@hiveio/dhive`. Companion: `@hiveio/signers-keychain` for browser-side signing, `@hiveio/signers-external` for non-Keychain flows. |
| Blockchain (read/index) | Custom listener (MVP) → HAF (Phase 2) | **MVP:** custom Node.js block stream listener + `hive_records` cache table. Defensible for MVP scale. **Phase 2:** migrate to HAF (Hive Application Framework) — a PostgreSQL extension that pushes Hive block data directly into SQL tables and handles fork reversion automatically. Our listener is a hand-rolled subset of what HAF provides. |
| Provisioning Service | Node.js (standalone) | Creates Hive accounts for Google OAuth users (`account_create` op). Delegates Resource Credits (`delegate_vesting_shares`) to new zero-RC accounts. Stores active keys in KMS for custodial Google users. |
| Agent Account | Platform-held Hive account | Signs `escrow_approve` (auto-ratification) server-side via WAX + KMS immediately after escrow_transfer confirms. This account's active key is the highest-value secret in the system — it can move all escrowed funds. Must be stored in KMS/HSM, not an env var. See doc 05 for hardening requirements. |
| Hosting | `Render / Railway` | Free tier supports Node.js and PostgreSQL. No infrastructure overhead for internship-scale demo. |

---

## Why Not MongoDB?

A document database is the wrong shape for this data. Jobs, proposals, contracts, and milestones have strict foreign-key relationships and require transactional integrity — particularly around escrow state changes where a partial write leaves the system in an inconsistent state.

---

## Why Not Ethereum / Solidity?

Hive's fee-less model and 3-second block time make it viable for the high-frequency interactions a freelance platform generates. Ethereum gas fees would make small contracts economically unworkable. Splinterlands confirms Hive infrastructure is production-ready for application-layer activity.

---

## Why WAX over dhive?

`@hiveio/wax` uses the same C++ protocol code as the Hive core node, ensuring it is always compatible with the blockchain protocol by definition. `@hiveio/dhive` is maintained separately and has historically lagged behind protocol updates. WAX is the Greateck standard and the Hive ecosystem direction.

---

## HAF Trade-off (Custom Listener vs HAF)

| | Custom Listener (MVP) | HAF (Phase 2) |
|--|----------------------|---------------|
| Infrastructure | Public API node only | Requires own hived node + sql_serializer plugin + PostgreSQL with HAF extension |
| Fork handling | Manual (listener must detect and revert) | Automatic |
| Query capability | Limited (only what listener writes to hive_records) | Full SQL over all Hive block data |
| Setup complexity | Low | High (~62 hours full replay on fast hardware) |
| Scale | MVP only | Production-grade |

For MVP, the custom listener is the right trade-off. Migrate to HAF before production.