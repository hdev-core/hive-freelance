# 01 — Tech Stack Decision
**Project:** Hive Freelance Escrow Platform   
**Phase:** Planning - System Architecture & Data Model 

> **Greateck standard (architecture card 08 Jul):** WAX (`@hiveio/wax`) for building/signing transactions and `custom_json` ops — **not** `@hiveio/dhive`. **HAF** (PostgreSQL projection of the chain) for reading/indexing on-chain records — **not** a permanent hand-rolled block listener + cache table. Milestone 1 foundation acceptance follows this standard.

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
| Blockchain (tx) | `@hiveio/wax` | Greateck standard. Multi-language OO library using the same C++ protocol code as Hive core — always protocol-compatible. Replaces `@hiveio/dhive`. Companion: `@hiveio/wax-signers-keychain` for browser-side signing. |
| Blockchain (read/index) | **HAF** (required for Milestone 1 foundation) | Hive Application Framework: PostgreSQL projection of chain data (fork-aware). **Milestone 1 acceptance:** app reads Hive account/records via HAF. A temporary custom listener + `hive_records` may exist only as interim scaffolding while HAF is wired — it is **not** the target read path and must not satisfy M1 acceptance alone. |
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

## HAF vs interim custom listener

| | Interim custom listener | **HAF (Milestone 1 standard)** |
|--|------------------------|--------------------------------|
| Role | Temporary scaffold / optional sync helper | **Required** read/index path for foundation acceptance |
| Infrastructure | Public API node only | hived + sql_serializer (or shared Greateck HAF) + PostgreSQL |
| Fork handling | Manual | Automatic |
| Query capability | Only what we write to `hive_records` | SQL over projected chain data |
| Acceptance | Does **not** close M1 “read via HAF” | Closes M1 read criteria |

**Milestone 1 foundation also includes:** Keychain challenge scaffolding, and an RC-delegation-on-provisioning stub. This layer is shared plumbing — not marketplace feature logic.

See: `Docs/[04] For Ali/[4.3] Tasks/[01] Milestone_1_Hive_Layer_Work_Plan.md`.