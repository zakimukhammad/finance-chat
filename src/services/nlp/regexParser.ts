import { ParsedTransaction } from '../../types';
import { formatISO, subDays, previousMonday, previousTuesday, previousWednesday, previousThursday, previousFriday, previousSaturday, previousSunday } from 'date-fns';

// ─── Fast-Path Regex Patterns (Section 12.1 of TRD) ────────────────────────

// ─── Fast-Path Regex Patterns (Section 12.1 of TRD) ────────────────────────

// Format 1: [verb] [amount] [on|for|buat|untuk] [description]
// Example: "spent 50 on lunch", "bayar 150000 listrik", "jajan 15k"
const EXPENSE_PATTERN_1 =
  /^(?:spent|paid|bought|beli|bayar|jajan|makan)\s+([$€£¥A-Za-z]*[\d.,]+[kK]?)(?:\s+(?:on|for|buat|untuk))?\s*(.*)$/i;

// Format 2: [verb] [description] [for] [amount]
// Example: "bought coffee for 4.50", "beli bensin 50k"
const EXPENSE_PATTERN_2 =
  /^(?:spent|paid|bought|beli|bayar|jajan|makan)\s+(.+?)\s+(?:for\s+)?([$€£¥A-Za-z]*[\d.,]+[kK]?)$/i;

// Format 1: [verb] [amount] [from|dari] [description]
// Example: "earned 3000 from salary", "terima 200 dari budi"
const INCOME_PATTERN_1 =
  /^(?:earned|received|got\s+paid|dapat|terima|dapet)\s+([$€£¥A-Za-z]*[\d.,]+[kK]?)(?:\s+(?:from|dari))?\s*(.*)$/i;

// Format 2: [verb] [description] [amount]
// Example: "dapat bonus 1000k"
const INCOME_PATTERN_2 =
  /^(?:earned|received|got\s+paid|dapat|terima|dapet)\s+(.+?)\s+([$€£¥A-Za-z]*[\d.,]+[kK]?)$/i;

// Bare amount + description
// Example: "45 groceries", "Rp50000 pulsa", "$100 freelance"
const BARE_AMOUNT_PATTERN =
  /^([$€£¥A-Za-z]*[\d.,]+[kK]?)\s+(.+)$/;

// ─── Currency Symbol Map ────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  'Rp': 'IDR',
  'rp': 'IDR',
  'RM': 'MYR',
  'rm': 'MYR',
  '¥': 'JPY',
  'S$': 'SGD',
  's$': 'SGD',
};

// ─── Relative Date Words ────────────────────────────────────────────────────

const RELATIVE_DATE_WORDS: Record<string, () => Date> = {
  'today': () => new Date(),
  'hari ini': () => new Date(),
  'yesterday': () => subDays(new Date(), 1),
  'kemarin': () => subDays(new Date(), 1),
  'kemaren': () => subDays(new Date(), 1),
  'last monday': () => previousMonday(new Date()),
  'last tuesday': () => previousTuesday(new Date()),
  'last wednesday': () => previousWednesday(new Date()),
  'last thursday': () => previousThursday(new Date()),
  'last friday': () => previousFriday(new Date()),
  'last saturday': () => previousSaturday(new Date()),
  'last sunday': () => previousSunday(new Date()),
  'this morning': () => new Date(),
  'tadi pagi': () => new Date(),
  'tadi': () => new Date(),
};

/**
 * Try the regex fast-path to parse a transaction from text.
 * Returns a ParsedTransaction with high confidence if a clear pattern matches.
 */
export function tryRegexFastPath(text: string, ownerCurrency: string): ParsedTransaction | null {
  const trimmed = text.trim();

  // Try expense pattern 1 (verb amount desc)
  let match = trimmed.match(EXPENSE_PATTERN_1);
  if (match) {
    const verb = trimmed.split(/\s+/)[0];
    const desc = match[2] ? match[2] : verb;
    return buildResult('LOG_EXPENSE', match[1], desc, trimmed, ownerCurrency);
  }

  // Try expense pattern 2 (verb desc amount)
  match = trimmed.match(EXPENSE_PATTERN_2);
  if (match) {
    return buildResult('LOG_EXPENSE', match[2], match[1], trimmed, ownerCurrency);
  }

  // Try income pattern 1 (verb amount desc)
  match = trimmed.match(INCOME_PATTERN_1);
  if (match) {
    return buildResult('LOG_INCOME', match[1], match[2] || null, trimmed, ownerCurrency);
  }

  // Try income pattern 2 (verb desc amount)
  match = trimmed.match(INCOME_PATTERN_2);
  if (match) {
    return buildResult('LOG_INCOME', match[2], match[1], trimmed, ownerCurrency);
  }

  // Try bare amount + description (default to expense)
  match = trimmed.match(BARE_AMOUNT_PATTERN);
  if (match) {
    return buildResult('LOG_EXPENSE', match[1], match[2], trimmed, ownerCurrency, 0.80);
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildResult(
  intent: 'LOG_EXPENSE' | 'LOG_INCOME',
  rawAmount: string,
  rawDescription: string | null,
  originalText: string,
  ownerCurrency: string,
  baseConfidence: number = 0.92
): ParsedTransaction {
  const { amount, currency } = parseAmount(rawAmount, originalText, ownerCurrency);
  const date = extractDate(originalText);
  const description = rawDescription?.trim() || null;

  return {
    intent,
    amount,
    currency,
    category_hint: description, // The AI category matcher will resolve this later
    description,
    date,
    confidence: baseConfidence,
  };
}

/**
 * Parse a raw amount string like "50", "1,200", "50k", "1.5K", "$45", "Rp50000".
 */
export function parseAmount(raw: string, fullText: string, ownerCurrency: string): { amount: number; currency: string } {
  let currency = ownerCurrency;
  let cleaned = raw.trim();

  // Detect currency from full text or amount string
  currency = detectCurrency(fullText) || ownerCurrency;

  // Remove currency symbols from the amount
  for (const sym of Object.keys(CURRENCY_SYMBOLS)) {
    if (cleaned.startsWith(sym)) {
      cleaned = cleaned.slice(sym.length).trim();
      currency = CURRENCY_SYMBOLS[sym];
    }
  }

  // Handle "k" suffix: 50k → 50000, 1.5k → 1500
  const kMatch = cleaned.match(/^([\d.,]+)[kK]$/);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/,/g, ''));
    return { amount: num * 1000, currency };
  }

  // Standard number parsing (handles commas as thousands separators)
  const amount = parseFloat(cleaned.replace(/,/g, ''));
  return { amount: isNaN(amount) ? 0 : amount, currency };
}

/**
 * Detect currency from text using symbols or ISO codes.
 */
export function detectCurrency(text: string): string | null {
  // Check for currency symbols
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(sym)) return code;
  }

  // Check for ISO codes mentioned explicitly
  const isoMatch = text.match(/\b(USD|EUR|GBP|IDR|SGD|MYR|JPY)\b/i);
  if (isoMatch) return isoMatch[1].toUpperCase();

  return null;
}

/**
 * Extract a date from text. Supports relative dates like "yesterday", "kemarin", "3 days ago", etc.
 */
export function extractDate(text: string): string {
  const lower = text.toLowerCase();
  const today = formatISO(new Date(), { representation: 'date' });

  // Check known relative date words
  for (const [word, fn] of Object.entries(RELATIVE_DATE_WORDS)) {
    if (lower.includes(word)) {
      return formatISO(fn(), { representation: 'date' });
    }
  }

  // "N days ago" / "N hari lalu"
  const daysAgoMatch = lower.match(/(\d+)\s*(?:days?\s*ago|hari\s*(?:yang\s*)?lalu)/);
  if (daysAgoMatch) {
    return formatISO(subDays(new Date(), parseInt(daysAgoMatch[1], 10)), { representation: 'date' });
  }

  // Explicit date YYYY-MM-DD
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Default to today
  return today;
}
