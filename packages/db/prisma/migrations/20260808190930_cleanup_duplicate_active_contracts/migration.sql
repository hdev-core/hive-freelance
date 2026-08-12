-- Demote duplicate active contracts before the unique index that enforces
-- "one active contract per job" (see the migration right after this one,
-- 20260808190931_add_active_contract_per_job_index). For any job with more
-- than one active contract, keep the earliest (by created_at) and cancel
-- the rest. This state is reachable from before PR #19's locking fix
-- landed — unlocked concurrent accepts could create two active contracts
-- on one job — so any environment that served traffic before #19 may
-- hold it today. This is a separate, earlier-dated migration rather than
-- folded into the index migration itself, since that one is already
-- applied on the shared dev DB and editing it after the fact breaks its
-- recorded checksum for anyone else who's already applied it.
WITH ranked AS (
  SELECT id, job_id,
         ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at ASC, id ASC) AS rn
  FROM contracts
  WHERE status = 'active'
)
UPDATE contracts
SET status = 'cancelled', end_date = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);