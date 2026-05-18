// ─── Default Expense Categories ─────────────────────────────────────────────

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food & Dining",    icon: "🍔", color: "#FF6B6B" },
  { name: "Transport",        icon: "🚗", color: "#4ECDC4" },
  { name: "Housing & Rent",   icon: "🏠", color: "#45B7D1" },
  { name: "Utilities",        icon: "💡", color: "#96CEB4" },
  { name: "Health & Medical",  icon: "🏥", color: "#FFEAA7" },
  { name: "Entertainment",    icon: "🎮", color: "#DDA0DD" },
  { name: "Shopping",         icon: "👕", color: "#98D8C8" },
  { name: "Education",        icon: "📚", color: "#F7DC6F" },
  { name: "Travel",           icon: "✈️", color: "#85C1E9" },
  { name: "Work & Business",  icon: "💼", color: "#A9CCE3" },
  { name: "Pets",             icon: "🐾", color: "#F0B27A" },
  { name: "Gifts & Donations", icon: "🎁", color: "#C39BD3" },
  { name: "Subscriptions",    icon: "📱", color: "#76D7C4" },
  { name: "Maintenance",      icon: "🔧", color: "#AED6F1" },
  { name: "Other",            icon: "❓", color: "#BFC9CA" },
];

// ─── Default Income Categories ──────────────────────────────────────────────

export const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salary",           icon: "💵", color: "#2ECC71" },
  { name: "Investment",       icon: "🏦", color: "#27AE60" },
  { name: "Freelance",        icon: "🧾", color: "#1ABC9C" },
  { name: "Bonus / Gift",     icon: "🎁", color: "#16A085" },
  { name: "Refund",           icon: "💸", color: "#48C9B0" },
  { name: "Other Income",     icon: "❓", color: "#A9DFBF" },
];

// ─── Supported Currencies ───────────────────────────────────────────────────

export const CURRENCIES = [
  { code: "USD", symbol: "$",  name: "US Dollar",       flag: "🇺🇸" },
  { code: "EUR", symbol: "€",  name: "Euro",            flag: "🇪🇺" },
  { code: "GBP", symbol: "£",  name: "British Pound",   flag: "🇬🇧" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", flag: "🇮🇩" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", flag: "🇲🇾" },
  { code: "JPY", symbol: "¥",  name: "Japanese Yen",    flag: "🇯🇵" },
];

// ─── Timezones ──────────────────────────────────────────────────────────────

export const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Singapore",
  "UTC",
  "US/Eastern",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
];

// ─── Default Owner Settings ─────────────────────────────────────────────────

export const DEFAULT_OWNER_SETTINGS = {
  daily_digest: false,
  weekly_digest: false,
  digest_hour: 21,
  show_budget_in_summary: true,
};

// ─── App Constants ──────────────────────────────────────────────────────────

export const MAX_HISTORY_LIMIT = 50;
export const DEFAULT_HISTORY_LIMIT = 10;
export const UNDO_TIMEOUT_MS = 60_000;          // 60 seconds
export const CONVERSATION_STATE_TTL = 86_400;   // 24 hours in seconds
export const MAX_AMOUNT = 999_999_999;
export const RATE_LIMIT_PER_MINUTE = 10;
