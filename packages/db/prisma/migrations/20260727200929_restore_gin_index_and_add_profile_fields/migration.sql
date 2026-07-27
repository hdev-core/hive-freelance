-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "portfolio_links" JSONB;

-- Restore idx_hive_records_payload_gin, dropped by Prisma drift-detection
-- because it isn't expressible in schema.prisma (see file header comment
-- and RECONCILIATION.md). IF NOT EXISTS makes this safe to re-run.
CREATE INDEX IF NOT EXISTS idx_hive_records_payload_gin ON hive_records USING GIN (payload);

-- portfolio_links shape guard: must be a JSON array of at most 10 items.
-- Per-element {title, url} shape (and http/https-only URLs) is validated
-- in application code (Zod), not here — see route layer.
ALTER TABLE profiles ADD CONSTRAINT portfolio_links_shape CHECK (
  portfolio_links IS NULL OR (
    jsonb_typeof(portfolio_links) = 'array'
    AND jsonb_array_length(portfolio_links) <= 10
  )
);
