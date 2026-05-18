-- Monthly summary (income/expense totals by category and month)
CREATE OR REPLACE VIEW monthly_summary AS
SELECT
  DATE_TRUNC('month', date::timestamp)::DATE AS month,
  type,
  category_id,
  SUM(amount_base)                AS total,
  COUNT(*)                        AS txn_count
FROM transactions
GROUP BY 1, 2, 3;

-- Budget utilisation for the current calendar month
CREATE OR REPLACE VIEW budget_status AS
SELECT
  b.id,
  b.category_id,
  c.name                                              AS category_name,
  c.icon,
  b.amount                                            AS budget_amount,
  b.period,
  b.alert_threshold,
  b.alerted_80_at,
  b.alerted_100_at,
  COALESCE(SUM(t.amount_base), 0)                     AS spent,
  ROUND(
    (COALESCE(SUM(t.amount_base), 0) / b.amount) * 100
  )                                                   AS pct_used
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t
  ON  t.category_id = b.category_id
  AND t.type        = 'expense'
  AND DATE_TRUNC('month', t.date::timestamp) = DATE_TRUNC('month', CURRENT_DATE::timestamp)
GROUP BY b.id, b.category_id, c.name, c.icon,
         b.amount, b.period, b.alert_threshold,
         b.alerted_80_at, b.alerted_100_at;
