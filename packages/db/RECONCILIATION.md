# Why this schema is a superset of Docs [02]

`Docs/[03] System_Architecture_Data_Model/[02] DB_Schema_and_ER_Diagram.md`
documents 11 tables. `schema.prisma` here has 13, plus five extra columns on
`payments`. This file explains the difference so a reviewer diffing
schema-vs-doc doesn't read it as scope creep.

## What's extra, and why

- **`listener_state`** — tracks the block listener's cursor position (last
  processed block). Not in doc `[02]`, but required for the listener
  described in `[01] Tech_Stack.md`'s "Blockchain (read/index)" row and
  detailed further in the escrow/architecture docs. Used by
  `packages/db` (cursor read/update) and `apps/listener`.
- **`agent_signing_events`** — audit log for the platform agent account's
  auto-ratification signing (`escrow_approve`), consistent with the agent
  account behavior described in `[01] Tech_Stack.md`'s "Agent Account" row
  and the escrow hardening docs. Used by `apps/api/src/services/agentEscrow.ts`.
- **`payments.freelancer_approve_tx_id`, `agent_approve_tx_id`, `release_tx_id`,
  `ratification_deadline`, `escrow_expiration`** — tx-tracking and deadline
  fields for the escrow ratification flow. Used by
  `apps/api/src/services/payments.ts` and `apps/listener/src/paymentSync.ts`.

None of this is invented for this pass — it was already implemented and in
active use in Ali's `apps/api` / `apps/listener` code (originally as raw SQL
in a `packages/db/migrations/*.sql` set that predates this Prisma version).
This schema just re-implements the same tables/columns in Prisma so there's
one migration history instead of two.

## What this means for doc [02]

Doc `[02]` should get a follow-up pass to document these three additions as
part of the real schema, not left as an undocumented gap. Flagging this
explicitly in the PR rather than quietly updating the doc myself, since it
touches Ali's listener/escrow work and the doc itself may be owned jointly.

## History

This schema was originally built with Knex (raw SQL migrations, `backend/`
folder) before the professor's Supabase + Prisma directive. That Knex
version is not part of this deliverable and won't be committed — this
Prisma version in `packages/db/` replaces it entirely, per
`DEPLOYMENT.md` §3b.
