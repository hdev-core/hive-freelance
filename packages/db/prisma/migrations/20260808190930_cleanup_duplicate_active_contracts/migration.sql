-- Demote duplicate active contracts before the unique index that enforces
-- "one active contract per job" (see the migration right after this one,
-- 20260808190931_add_active_contract_per_job_index). For any job with more
-- than one active contract, keep one and cancel the rest. This state is
-- reachable from before PR #19's locking fix landed — unlocked concurrent
-- accepts could create two active contracts on one job — so any
-- environment that served traffic before #19 may hold it today. This is a
-- separate, earlier-dated migration rather than folded into the index
-- migration itself, since that one is already applied on the shared dev
-- DB and editing it after the fact breaks its recorded checksum for
-- anyone else who's already applied it.
--
-- Safety check first: for each job with duplicates, determine which
-- contract WOULD be closed under the tiebreak below, and refuse to run
-- at all if that specific contract has a hive_tx_id (it's actually on
-- Hive) or a funded/escrowed milestone. On this project the chain is
-- canonical and Postgres is the fast duplicate — silently cancelling a
-- contract that's actually broadcast or has real escrow against it would
-- make the two disagree silently, in a repair script, which is the worst
-- place for that to happen. Fail loudly and name the job id instead.
DO $$
DECLARE
  bad_job RECORD;
BEGIN
  FOR bad_job IN
    SELECT ranked.job_id, ranked.id AS contract_id
    FROM (
      SELECT c.id, c.job_id, c.hive_tx_id,
             ROW_NUMBER() OVER (
               PARTITION BY c.job_id
               ORDER BY (c.hive_tx_id IS NOT NULL) DESC, c.created_at ASC, c.id ASC
             ) AS rn
      FROM contracts c
      WHERE c.status = 'active'
    ) ranked
    WHERE ranked.rn > 1
      AND (
        ranked.hive_tx_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM milestones m
          WHERE m.contract_id = ranked.id
            AND m.status IN ('funded', 'submitted', 'approved', 'released')
        )
      )
  LOOP
    RAISE EXCEPTION
      'Refusing to auto-close contract % on job % — it has a hive_tx_id or a funded milestone. Resolve manually before re-running this migration.',
      bad_job.contract_id, bad_job.job_id;
  END LOOP;
END $$;

-- Among the (now confirmed safe) duplicates, prefer to keep the contract
-- that has a hive_tx_id — i.e. was actually confirmed on-chain — over one
-- that doesn't, since an unconfirmed duplicate is the more likely
-- leftover of the race, not the "real" contract the client actually
-- broadcast. created_at/id are just deterministic tiebreakers for the
-- remaining case (neither has a hive_tx_id).
WITH ranked AS (
  SELECT id, job_id,
         ROW_NUMBER() OVER (
           PARTITION BY job_id
           ORDER BY (hive_tx_id IS NOT NULL) DESC, created_at ASC, id ASC
         ) AS rn
  FROM contracts
  WHERE status = 'active'
)
UPDATE contracts
SET status = 'cancelled', end_date = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
