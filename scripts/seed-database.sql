-- Database schema. Docker runs it automatically on the first start of the db container.
-- Elsewhere: psql "$DATABASE_KEY" -f scripts/seed-database.sql
-- Then make yourself the owner: make owner LOGIN=<your 42 login>

-- 1. Schema and core tables
CREATE SCHEMA IF NOT EXISTS leets;

CREATE TABLE IF NOT EXISTS leets.vip (
    id SERIAL PRIMARY KEY,
    category TEXT DEFAULT NULL,
    login TEXT DEFAULT NULL UNIQUE,
    profile TEXT DEFAULT NULL,
    token TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leets.blocked_logins (
    login TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('test', 'staff')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leets.blocked_logins_meta (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leets.blocked_logins_meta (id, last_refreshed_at)
VALUES (1, '1970-01-01'::timestamp)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_blocked_logins_source ON leets.blocked_logins(source);

-- 2. Calendar events, one JSON document per 42 login (the API also creates it on first use)
CREATE TABLE IF NOT EXISTS calendar_state (
    login TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
