-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────
-- OWNER (single row — the developer/user)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owner (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id  BIGINT      UNIQUE NOT NULL,
  currency     CHAR(3)     NOT NULL DEFAULT 'USD',
  timezone     TEXT        NOT NULL DEFAULT 'UTC',
  settings     JSONB       NOT NULL DEFAULT '{
    "daily_digest": false,
    "weekly_digest": false,
    "digest_hour": 21,
    "show_budget_in_summary": true
  }',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- CATEGORIES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL DEFAULT '💰',
  type       TEXT    NOT NULL CHECK (type IN ('expense', 'income', 'both')),
  color      CHAR(7) NOT NULL DEFAULT '#4CAF50',
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- RECURRING TRANSACTIONS (defined before transactions for FK)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  description    TEXT    NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type           TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
  category_id    UUID    REFERENCES categories(id) ON DELETE SET NULL,
  frequency      TEXT    NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_due_date  DATE    NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- TRANSACTIONS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT    NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency      CHAR(3) NOT NULL,
  amount_base   NUMERIC(12, 2),   -- converted to owner.currency
  category_id   UUID    REFERENCES categories(id) ON DELETE SET NULL,
  description   TEXT,
  date          DATE    NOT NULL DEFAULT CURRENT_DATE,
  source        TEXT    NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'recurring', 'import')),
  recurring_id  UUID    REFERENCES recurring_transactions(id) ON DELETE SET NULL,
  metadata      JSONB   NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- BUDGETS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  period           TEXT    NOT NULL DEFAULT 'monthly'
                     CHECK (period IN ('weekly', 'monthly', 'yearly')),
  alert_threshold  INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold BETWEEN 1 AND 100),
  alerted_80_at    TIMESTAMPTZ,
  alerted_100_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, period)
);

-- ──────────────────────────────────────────
-- SAVINGS GOALS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS savings_goals (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  target_amount   NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  deadline        DATE,
  status          TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'paused')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- EXCHANGE RATE CACHE
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  base_currency    CHAR(3) NOT NULL,
  target_currency  CHAR(3) NOT NULL,
  rate             NUMERIC(18, 8) NOT NULL,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (base_currency, target_currency)
);
