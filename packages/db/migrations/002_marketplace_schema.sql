-- Full marketplace schema (doc 02). Builds on 001_bootstrap (users, oauth_accounts, hive_records).

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hive_records_updated_at ON hive_records;
CREATE TRIGGER trg_hive_records_updated_at
  BEFORE UPDATE ON hive_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_listener_state_updated_at ON listener_state;
CREATE TRIGGER trg_listener_state_updated_at
  BEFORE UPDATE ON listener_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  bio TEXT,
  avatar_url TEXT,
  location TEXT,
  hourly_rate NUMERIC(10, 2) CHECK (hourly_rate IS NULL OR hourly_rate > 0),
  skills TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES users (id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget NUMERIC(10, 2) NOT NULL CHECK (budget > 0),
  category TEXT,
  skills_required TEXT[],
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs (client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_status_open ON jobs (status) WHERE status = 'open';

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- proposals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS proposals (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs (id),
  freelancer_id BIGINT NOT NULL REFERENCES users (id),
  cover_letter TEXT NOT NULL,
  bid_amount NUMERIC(10, 2) NOT NULL CHECK (bid_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  hive_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, freelancer_id)
);

CREATE INDEX IF NOT EXISTS idx_proposals_job_id ON proposals (job_id);
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_id ON proposals (freelancer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals (status);

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON proposals;
CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- contracts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contracts (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs (id),
  proposal_id BIGINT NOT NULL UNIQUE REFERENCES proposals (id),
  client_id BIGINT NOT NULL REFERENCES users (id),
  freelancer_id BIGINT NOT NULL REFERENCES users (id),
  total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  completed_by_client BOOLEAN NOT NULL DEFAULT false,
  completed_by_freelancer BOOLEAN NOT NULL DEFAULT false,
  hive_tx_id TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts (client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_id ON contracts (freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);
CREATE INDEX IF NOT EXISTS idx_contracts_job_id ON contracts (job_id);

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON contracts;
CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS milestones (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  milestone_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'funded', 'submitted', 'approved', 'released')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  hive_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestones_contract_id ON milestones (contract_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones (status);
CREATE INDEX IF NOT EXISTS idx_milestones_status_pending
  ON milestones (status) WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_milestones_updated_at ON milestones;
CREATE TRIGGER trg_milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts (id),
  milestone_id BIGINT NOT NULL REFERENCES milestones (id),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'HBD' CHECK (currency IN ('HIVE', 'HBD')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'awaiting_ratification',
      'escrowed',
      'released',
      'refunded',
      'disputed'
    )),
  escrow_id INT,
  hive_tx_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_contract_id ON payments (contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_milestone_id ON payments (milestone_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- disputes (manual admin resolution; automated disputes out of product MVP)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS disputes (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts (id),
  milestone_id BIGINT NOT NULL REFERENCES milestones (id),
  raised_by BIGINT NOT NULL REFERENCES users (id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_direction TEXT CHECK (
    resolution_direction IS NULL
    OR resolution_direction IN ('to_client', 'to_freelancer')
  ),
  resolved_by TEXT,
  resolution_notes TEXT,
  escrow_dispute_tx_id TEXT,
  escrow_release_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disputes_contract_id ON disputes (contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_milestone_id ON disputes (milestone_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts (id),
  reviewer_id BIGINT NOT NULL REFERENCES users (id),
  reviewee_id BIGINT NOT NULL REFERENCES users (id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  hive_tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_contract_id ON reviews (contract_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews (reviewee_id);
