# 01 — Tech Stack Decision
**Project:** Hive Freelance Escrow Platform   
**Phase:** Planning - System Architecture & Data Model  
---

## Decision Summary

The stack was selected against three criteria: fit with Hive's ecosystem, team familiarity within a 5-week delivery window, and ability to support the escrow and on-chain reputation logic that differentiates this platform from a standard freelance marketplace.

---

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React (TypeScript) | Industry standard for dashboards and marketplaces. Hive Keychain has a well-documented React integration for transaction signing. TypeScript adds type safety across the codebase. |
| Backend | Node.js + Express | Matches the JS/TS ecosystem of the frontend. `@hiveio/dhive` (the official Hive client library) runs natively in Node. Fast to set up within the internship timeline. |
| Database | PostgreSQL | Data is highly relational — users, jobs, proposals, contracts, and milestones all reference each other with foreign keys and need transactional integrity. Postgres also supports JSON columns for caching Hive operation data. |
| Blockchain | Hive via `@hiveio/dhive` | Custom JSON operations store immutable on-chain records. Hive Keychain handles authentication and transaction signing without exposing private keys to the app. Fee-less Resource Credit model makes escrow viable for small contracts. |
| Hosting | Render / Railway | Free tier available, supports Node.js backends and PostgreSQL out of the box. No infrastructure overhead for a demo-ready internship project. |

---

## Why Not MongoDB?

A document database is the wrong shape for this data. Jobs, proposals, contracts, and milestones have strict foreign-key relationships and require transactional integrity — particularly around escrow state changes, where a partial write (e.g. milestone marked complete but payment not released) would leave the system in an inconsistent state. A relational schema with enforced constraints handles this correctly. MongoDB does not.

---

## Why Not Ethereum / Solidity?

Hive's fee-less model and 3-second block time make it viable for the high-frequency interactions a freelance platform generates — milestone confirmations, reputation updates, dispute triggers. Ethereum gas fees would make small contracts economically unworkable (a $50 freelance job shouldn't cost $8 in gas). Hive was explicitly designed for this kind of application-layer activity, and the precedent from Splinterlands confirms the infrastructure is production-ready.

---

## Key Dependency

The entire Hive interaction layer depends on **Hive Keychain** being installed in the user's browser. This is a known constraint and will be addressed in the Auth & Roles strategy (item 04).