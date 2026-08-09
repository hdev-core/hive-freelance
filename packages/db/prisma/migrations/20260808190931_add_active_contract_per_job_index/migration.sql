-- Restore idx_hive_records_payload_gin, dropped by Prisma drift-detection
-- because it isn't expressible in schema.prisma (see file header comment
-- and RECONCILIATION.md). IF NOT EXISTS makes this safe to re-run.
CREATE INDEX IF NOT EXISTS idx_hive_records_payload_gin ON hive_records USING GIN (payload);

-- Defense-in-depth alongside the job-row lock in acceptProposal: a job
-- should never have more than one active contract at once. Mapped to a
-- 409 in application code via isUniqueViolation.
CREATE UNIQUE INDEX idx_contracts_active_per_job ON contracts(job_id) WHERE status = 'active';