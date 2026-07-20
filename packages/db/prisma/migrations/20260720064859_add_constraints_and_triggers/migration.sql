CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_proposals_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_milestones_updated_at BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hive_records_updated_at BEFORE UPDATE ON hive_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_listener_state_updated_at BEFORE UPDATE ON listener_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- === CHECK constraints ===
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('client', 'freelancer', 'both'));
ALTER TABLE users ADD CONSTRAINT users_auth_type_check
  CHECK (auth_type IN ('keychain', 'google', 'claimed'));

ALTER TABLE profiles ADD CONSTRAINT profiles_hourly_rate_check
  CHECK (hourly_rate > 0);

ALTER TABLE oauth_accounts ADD CONSTRAINT oauth_accounts_provider_check
  CHECK (provider IN ('google'));

ALTER TABLE jobs ADD CONSTRAINT jobs_budget_check CHECK (budget > 0);
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('open', 'in_progress', 'completed'));

ALTER TABLE proposals ADD CONSTRAINT proposals_bid_amount_check
  CHECK (bid_amount > 0);
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected'));

ALTER TABLE contracts ADD CONSTRAINT contracts_total_amount_check
  CHECK (total_amount > 0);
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('active', 'completed', 'cancelled'));

ALTER TABLE milestones ADD CONSTRAINT milestones_amount_check
  CHECK (amount > 0);
ALTER TABLE milestones ADD CONSTRAINT milestones_status_check
  CHECK (status IN ('pending', 'funded', 'submitted', 'approved', 'released'));

ALTER TABLE payments ADD CONSTRAINT payments_amount_check
  CHECK (amount > 0);
ALTER TABLE payments ADD CONSTRAINT payments_currency_check
  CHECK (currency IN ('HIVE', 'HBD'));
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'awaiting_ratification', 'escrowed', 'released', 'refunded', 'disputed'));

ALTER TABLE disputes ADD CONSTRAINT disputes_status_check
  CHECK (status IN ('open', 'resolved'));
ALTER TABLE disputes ADD CONSTRAINT disputes_resolution_direction_check
  CHECK (resolution_direction IN ('to_client', 'to_freelancer'));

ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check
  CHECK (rating BETWEEN 1 AND 5);

-- === Partial indexes ===
CREATE INDEX idx_jobs_status_open ON jobs(status) WHERE status = 'open';
CREATE INDEX idx_milestones_status_pending ON milestones(status) WHERE status = 'pending';

-- === GIN index on JSONB ===
CREATE INDEX idx_hive_records_payload_gin ON hive_records USING GIN (payload);
