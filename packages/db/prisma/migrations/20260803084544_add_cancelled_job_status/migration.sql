-- Add 'cancelled' to the jobs.status CHECK constraint. Postgres has no
-- direct "alter check" — drop and recreate with the expanded value set.
-- 'completed' stays reserved for real delivery (drives reviews + escrow
-- release in M3); 'cancelled' is a distinct terminal state, not a reuse.
ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'));