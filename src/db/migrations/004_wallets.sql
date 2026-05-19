-- Migration 004: Add Wallets & Accounts

-- 1. Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  type TEXT NOT NULL, -- cash, bank, ewallet, credit, investment, other
  currency TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure only one default wallet
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_one_default ON wallets(is_default) WHERE is_default = true;

-- 3. Update transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;

-- 4. Update recurring_transactions table
ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS to_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;

-- 5. Update savings_goals table
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;

-- 6. Indices for wallet transactions
CREATE INDEX IF NOT EXISTS idx_txn_wallet ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_txn_to_wallet ON transactions(to_wallet_id);

-- 7. View for Wallet Balances
CREATE OR REPLACE VIEW wallet_balances AS
SELECT
  id,
  name,
  icon,
  type,
  currency,
  balance,
  is_default,
  sort_order
FROM wallets
ORDER BY sort_order ASC, name ASC;
