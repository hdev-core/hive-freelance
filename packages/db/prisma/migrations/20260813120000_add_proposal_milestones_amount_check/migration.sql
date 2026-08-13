-- Matches the amount > 0 CHECK already enforced on every peer amount column
-- (proposals.bid_amount, contracts.total_amount, milestones.amount,
-- payments.amount — see 20260720064859_add_constraints_and_triggers).
-- proposal_milestones was added later (20260806112920) without one; the
-- app validates the milestone-sum-equals-bid rule, but nothing stopped a
-- non-zod caller (or a future bug) from writing a zero/negative row.
ALTER TABLE "proposal_milestones" ADD CONSTRAINT "proposal_milestones_amount_check"
  CHECK (amount > 0);
