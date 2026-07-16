-- Bootstrap tables for tech-stack validation (full marketplace schema comes later).

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  hive_username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('client', 'freelancer', 'both')),
  auth_type TEXT NOT NULL DEFAULT 'keychain'
    CHECK (auth_type IN ('keychain', 'google', 'claimed')),
  kms_key_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  provider_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user_id
  ON oauth_accounts (provider_user_id);

CREATE TABLE IF NOT EXISTS hive_records (
  id BIGSERIAL PRIMARY KEY,
  hive_tx_id TEXT UNIQUE NOT NULL,
  app_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  from_account TEXT,
  to_account TEXT,
  escrow_id INT,
  payload JSONB,
  block_number BIGINT,
  block_timestamp TIMESTAMPTZ,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hive_records_operation_type
  ON hive_records (operation_type);

CREATE INDEX IF NOT EXISTS idx_hive_records_from_account
  ON hive_records (from_account);

CREATE INDEX IF NOT EXISTS idx_hive_records_payload
  ON hive_records USING GIN (payload);

CREATE INDEX IF NOT EXISTS idx_hive_records_block_number
  ON hive_records (block_number);

CREATE TABLE IF NOT EXISTS listener_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_processed_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO listener_state (id, last_processed_block)
VALUES ('default', 0)
ON CONFLICT (id) DO NOTHING;
