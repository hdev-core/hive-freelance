-- Matches the amount > 0 CHECK already enforced on every peer amount column
-- (proposals.bid_amount, contracts.total_amount, milestones.amount,
-- payments.amount — see 20260720064859_add_constraints_and_triggers).
-- proposal_milestones was added later (20260806112920) without one; the
-- app validated the milestone-sum-equals-bid rule, but a tiny value like
-- 1e-9 could pass every Zod check (positive, within epsilon of a cent) and
-- still round to exactly 0 — closed at the Zod layer too (routes/proposals.ts),
-- but this constraint is the defence-in-depth backstop, not the only guard.
--
-- Same treatment as 20260808190930_cleanup_duplicate_active_contracts for
-- the same failure class: ADD CONSTRAINT with no pre-check can wedge every
-- later migration behind an opaque 23514 that names no row. Fail loudly and
-- name the offending proposal_ids instead — these are proposal-stage-only
-- rows (never promoted to a real, already-CHECK-constrained Milestone row
-- unless a contract was actually created against them), so there's no case
-- here where auto-repairing is obviously safe; a human should look at what
-- produced a zero/negative milestone before this constraint goes on.
--
-- ALTER TABLE ADD CONSTRAINT has no IF NOT EXISTS, so the whole thing is
-- wrapped in a DO block: check pg_constraint first and no-op if it's
-- already there, making this migration safe to re-run.
DO $$
DECLARE
  bad_ids text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposal_milestones_amount_check'
  ) THEN
    RETURN;
  END IF;

  SELECT string_agg(DISTINCT proposal_id::text, ', ' ORDER BY proposal_id::text)
    INTO bad_ids
    FROM proposal_milestones
    WHERE amount <= 0;

  IF bad_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Refusing to add proposal_milestones_amount_check — existing row(s) with amount <= 0 on proposal_id(s): %. Resolve manually before re-running this migration.',
      bad_ids;
  END IF;

  ALTER TABLE proposal_milestones ADD CONSTRAINT proposal_milestones_amount_check CHECK (amount > 0);
END $$;
