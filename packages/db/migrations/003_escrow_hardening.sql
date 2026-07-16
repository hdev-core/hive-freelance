-- Escrow hardening: track agent/freelancer approve txs + deadlines + agent audit

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS freelancer_approve_tx_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_approve_tx_id TEXT,
  ADD COLUMN IF NOT EXISTS release_tx_id TEXT,
  ADD COLUMN IF NOT EXISTS ratification_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escrow_expiration TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS agent_signing_events (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT REFERENCES payments (id),
  escrow_id INT,
  operation_type TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_signing_events_payment
  ON agent_signing_events (payment_id);
