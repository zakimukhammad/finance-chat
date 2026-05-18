CREATE INDEX IF NOT EXISTS idx_txn_date     ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_txn_type     ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_txn_month    ON transactions (DATE_TRUNC('month', date::timestamp));
CREATE INDEX IF NOT EXISTS idx_txn_source   ON transactions (source);
CREATE INDEX IF NOT EXISTS idx_rec_due      ON recurring_transactions (next_due_date) WHERE active = TRUE;
