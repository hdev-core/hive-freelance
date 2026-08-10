# Phase A1 — Milestone 1 brief (2 minutes)

> **Owner:** Ali · **Date:** 2026-07-27  
> **Use this** when someone asks “what is Milestone 1?”  
> **Source:** Architecture card 08 Jul · [`Docs/[03]/[01] Tech_Stack.md`](../../../../../[03]%20System_Architecture_Data_Model/[01]%20Tech_Stack.md)

---

## What Milestone 1 is

Milestone 1 builds the **shared Hive plumbing** that later features (auth polish, escrow, jobs) will reuse.

It is the pipes and electricity — **not** the furniture.

## What it is not

- Not job posting / proposals / marketplace UX
- Not full escrow Fund → Release feature polish
- Not disputes UI
- Not production AWS/GCP KMS

## Four foundation pieces

| Piece | One sentence |
|-------|----------------|
| **WAX** (`@hiveio/wax`) | Official library to **build and sign** Hive transactions and `custom_json`. **Not** `@hiveio/dhive`. |
| **HAF** | Official way to **read/index** chain data into PostgreSQL. **Not** a permanent hand-rolled block listener + `hive_records` cache. |
| **Keychain challenge** | Prove the browser user owns Hive account X (challenge → sign → verify → session). |
| **RC stub** | On provisioning, dry-run (by default) Resource Credit delegation so new accounts can broadcast later. |

## Done when (acceptance)

1. App reads a Hive account / on-chain records **via HAF**.
2. Signed Keychain challenge **round-trips**.
3. A **WAX-built** `custom_json` broadcasts on testnet **or** a clear mock — with evidence.
4. Backend scaffold exists (already largely true).

## One-breath summary

> “M1 is WAX for writes/signing, HAF for reads, Keychain login challenge, and an RC-delegation stub — shared Hive layer only, no marketplace feature work.”

## Next

- HAF path decision → [`[03] Phase_A_HAF_Decision.md`](Phase_A_HAF_Decision.md)
- File inventory → [`[04] Phase_A_Hive_Inventory.md`](Phase_A_Hive_Inventory.md)
- Full work plan → [`[01] Milestone_1_Hive_Layer_Work_Plan.md`](../../[01]%20Milestone_1_Hive_Layer_Work_Plan.md)
