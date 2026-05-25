// ─── Core Types ─────────────────────────────────────────────────────────────

export type TransactionType = "income" | "expense" | "transfer";
export type TransactionSource = "manual" | "recurring" | "import";
export type BudgetPeriod = "weekly" | "monthly" | "yearly";
export type GoalStatus = "active" | "completed" | "paused";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

// ─── Owner ──────────────────────────────────────────────────────────────────

export interface Owner {
  id: string;
  telegram_id: number;
  currency: string;       // ISO 4217 e.g. "USD"
  timezone: string;       // IANA e.g. "Asia/Jakarta"
  settings: OwnerSettings;
  created_at: string;
}

export interface OwnerSettings {
  daily_digest: boolean;
  weekly_digest: boolean;
  digest_hour: number;    // 0-23 in owner's local time
  show_budget_in_summary: boolean;
  default_wallet_id: string | null;
}

export type WalletType = "cash" | "bank" | "ewallet" | "credit" | "investment" | "other";

export interface Wallet {
  id: string;
  name: string;
  icon: string;
  type: WalletType;
  currency: string;
  balance: number;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

// ─── Transaction ────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  amount_base: number;    // converted to owner.currency
  wallet_id: string | null;
  to_wallet_id: string | null;
  category_id: string | null;
  description: string | null;
  date: string;           // ISO date "YYYY-MM-DD"
  source: TransactionSource;
  recurring_id: string | null;
  metadata: TransactionMetadata;
  created_at: string;
}

export interface TransactionMetadata {
  nlp_intent?: string;
  nlp_confidence?: number;
  nlp_raw?: string;
  photo_url?: string;
}

// ─── Category ───────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: "expense" | "income" | "both";
  is_system: boolean;
  sort_order: number;
  color: string;
}

// ─── Budget ─────────────────────────────────────────────────────────────────

export interface Budget {
  id: string;
  category_id: string;
  amount: number;
  period: BudgetPeriod;
  alert_threshold: number;  // percent, default 80
  alerted_80_at: string | null;
  alerted_100_at: string | null;
  created_at: string;
}

// ─── Savings Goal ───────────────────────────────────────────────────────────

export interface SavingsGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  wallet_id: string | null;   // optional: link goal to a specific wallet
  deadline: string | null;  // ISO date
  status: GoalStatus;
  created_at: string;
}

// ─── Recurring Transaction ──────────────────────────────────────────────────

export interface RecurringTransaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category_id: string;
  wallet_id: string | null;   // wallet to debit/credit on auto-log
  to_wallet_id: string | null;// for recurring transfers
  frequency: RecurringFrequency;
  next_due_date: string;    // ISO date
  active: boolean;
  created_at: string;
}

// ─── Exchange Rate ──────────────────────────────────────────────────────────

export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  fetched_at: string;
}

// ─── Conversation State ─────────────────────────────────────────────────────

export interface ConversationState {
  state: string;
  context: Record<string, unknown>;
  updated_at: string;
}

// ─── NLP Parse Result ───────────────────────────────────────────────────────

export interface ParsedTransaction {
  intent: "LOG_EXPENSE" | "LOG_INCOME" | "LOG_TRANSFER" | "UNKNOWN";
  amount: number;
  currency: string;
  category_hint: string | null;
  wallet_hint?: string | null;
  to_wallet_hint?: string | null;
  description: string | null;
  date: string;             // ISO date resolved from input
  confidence: number;       // 0.0 – 1.0
}

// ─── Budget Status (from view) ──────────────────────────────────────────────

export interface BudgetStatusRow {
  id: string;
  category_id: string;
  category_name: string;
  icon: string;
  budget_amount: number;
  period: BudgetPeriod;
  alert_threshold: number;
  alerted_80_at: string | null;
  alerted_100_at: string | null;
  spent: number;
  pct_used: number;
}

// ─── Summary Result ─────────────────────────────────────────────────────────

export interface SummaryResult {
  period: string;
  total_income: number;
  total_expense: number;
  net: number;
  by_category: CategorySummary[];
}

export interface CategorySummary {
  category_id: string;
  category_name: string;
  icon: string;
  total: number;
  txn_count: number;
  percentage: number;
}

// ─── Service Input Types ────────────────────────────────────────────────────

export interface CreateTransactionInput {
  type: TransactionType;
  amount: number;
  currency: string;
  wallet_id?: string | null;
  to_wallet_id?: string | null;
  category_id?: string | null;
  description?: string | null;
  date: string;
  source?: TransactionSource;
  recurring_id?: string | null;
  metadata?: TransactionMetadata;
}

export interface CreateRecurringInput {
  description: string;
  amount: number;
  type: TransactionType;
  category_id: string;
  wallet_id?: string | null;
  to_wallet_id?: string | null;
  frequency: RecurringFrequency;
  next_due_date: string;
}


