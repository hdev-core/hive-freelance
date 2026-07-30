#!/bin/sh
# Runs only on first Postgres volume init (docker-entrypoint-initdb.d).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
SELECT 'CREATE DATABASE hive_haf'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hive_haf')\gexec
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname hive_haf \
  -f /haf-schema/schema.sql

echo "[haf-local] hive_haf database + hafd schema seeded"
