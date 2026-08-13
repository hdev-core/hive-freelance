-- Defense-in-depth alongside the job-row lock in acceptProposal: a job
-- should never have more than one active contract at once. Mapped to a
-- 409 in application code via isUniqueViolation. IF NOT EXISTS so this
-- migration is safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_active_per_job ON contracts(job_id) WHERE status = 'active';
