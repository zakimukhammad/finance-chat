-- Migration 004: Add Wallets & Accounts

-- 1. Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  icon        TEXT    NOT NULL DEFAULT '💳',
  type        TEXT    NOT NULL DEFAULT 'other'
                CHECK (type IN ('cash', 'bank', 'ewallet', 'credit', 'investment', 'other')),
  currency    CHAR(3) NOT NULL DEFAULT 'USD',
  balance     NUMERIC(15, 2) NOT NULL DEFAULT 0,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure only one default wallet (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_one_default ON wallets (is_default) WHERE is_default = TRUE;

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
CREATE INDEX IF NOT EXISTS idx_wallets_order ON wallets(sort_order);

-- 7. Wallet Balances — computed view for reconciliation (TRD Section 8.2)
-- wallets.balance is a denormalised cache; this view is the source of truth.
CREATE OR REPLACE VIEW wallet_balances AS
SELECT
  w.id,
  w.name,
  w.icon,
  w.type,
  w.currency,
  w.is_default,
  w.sort_order,
  -- income INTO this wallet
  COALESCE(SUM(CASE WHEN t.type = 'income'   AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
  -- transfers INTO this wallet
+ COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.to_wallet_id = w.id THEN t.amount ELSE 0 END), 0)
  -- expenses FROM this wallet
- COALESCE(SUM(CASE WHEN t.type = 'expense'  AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
  -- transfers FROM this wallet
- COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.wallet_id    = w.id THEN t.amount ELSE 0 END), 0)
                                                                        AS computed_balance
FROM wallets w
LEFT JOIN transactions t ON (t.wallet_id = w.id OR t.to_wallet_id = w.id)
GROUP BY w.id, w.name, w.icon, w.type, w.currency, w.is_default, w.sort_order;
