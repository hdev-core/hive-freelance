-- Local HAF-compatible projection (Milestone 1).
-- Not a full hive_fork_manager install — table names mirror hafd.* so
-- HAF_DATABASE_URL can later point at shared Greateck HAF with SQL tweaks.

CREATE SCHEMA IF NOT EXISTS hafd;

CREATE TABLE IF NOT EXISTS hafd.accounts (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(16) NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  json_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS hafd.operations (
  id            BIGSERIAL PRIMARY KEY,
  block_num     INTEGER NOT NULL,
  trx_in_block  INTEGER NOT NULL DEFAULT 0,
  op_pos        INTEGER NOT NULL DEFAULT 0,
  op_type       TEXT NOT NULL,
  body          JSONB NOT NULL DEFAULT '{}'::jsonb,
  "timestamp"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hafd.account_operations (
  account_id    BIGINT NOT NULL REFERENCES hafd.accounts (id) ON DELETE CASCADE,
  operation_id  BIGINT NOT NULL REFERENCES hafd.operations (id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, operation_id)
);

CREATE INDEX IF NOT EXISTS hafd_accounts_name_idx ON hafd.accounts (name);
CREATE INDEX IF NOT EXISTS hafd_account_ops_account_idx
  ON hafd.account_operations (account_id, operation_id DESC);

-- Seed demo accounts + ops (idempotent)
INSERT INTO hafd.accounts (name, created_at, json_metadata)
VALUES
  ('initminer', '2016-03-24T16:05:00Z', '{"demo":true,"role":"genesis"}'::jsonb),
  ('hfdemo', '2026-01-15T12:00:00Z', '{"demo":true,"app":"hive-freelance"}'::jsonb),
  ('alice', '2025-06-01T08:30:00Z', '{"demo":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

INSERT INTO hafd.operations (id, block_num, trx_in_block, op_pos, op_type, body, "timestamp")
VALUES
  (1, 1000, 0, 0, 'custom_json',
   '{"id":"hive-freelance-v1","required_posting_auths":["hfdemo"],"json":"{\"op\":\"ping\"}"}'::jsonb,
   '2026-01-15T12:05:00Z'),
  (2, 1001, 0, 0, 'transfer',
   '{"from":"alice","to":"hfdemo","amount":"1.000 HBD","memo":"demo"}'::jsonb,
   '2026-01-16T09:00:00Z'),
  (3, 1002, 0, 0, 'custom_json',
   '{"id":"hive-freelance-v1","required_posting_auths":["alice"],"json":"{\"op\":\"note\"}"}'::jsonb,
   '2026-01-17T14:22:00Z')
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('hafd.operations', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM hafd.operations), 1)
);

INSERT INTO hafd.account_operations (account_id, operation_id)
SELECT a.id, o.id
FROM hafd.accounts a
CROSS JOIN hafd.operations o
WHERE (a.name = 'hfdemo' AND o.id IN (1, 2))
   OR (a.name = 'alice' AND o.id IN (2, 3))
ON CONFLICT DO NOTHING;
