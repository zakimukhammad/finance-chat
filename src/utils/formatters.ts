import currency from 'currency.js';
import { format } from 'date-fns';

// ─── Currency Formatting ────────────────────────────────────────────────────

const CURRENCY_CONFIG: Record<string, { symbol: string; precision: number; separator: string; decimal: string }> = {
  USD: { symbol: '$',  precision: 2, separator: ',', decimal: '.' },
  EUR: { symbol: '€',  precision: 2, separator: ',', decimal: '.' },
  GBP: { symbol: '£',  precision: 2, separator: ',', decimal: '.' },
  IDR: { symbol: 'Rp', precision: 0, separator: ',', decimal: '.' },
  SGD: { symbol: 'S$', precision: 2, separator: ',', decimal: '.' },
  MYR: { symbol: 'RM', precision: 2, separator: ',', decimal: '.' },
  JPY: { symbol: '¥',  precision: 0, separator: ',', decimal: '.' },
};

/**
 * Format a numeric amount with the correct currency symbol and precision.
 * e.g. formatCurrency(50000, "IDR") → "Rp50,000"
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  const config = CURRENCY_CONFIG[currencyCode] || { symbol: currencyCode + ' ', precision: 2, separator: ',', decimal: '.' };
  return currency(amount, {
    symbol: config.symbol,
    precision: config.precision,
    separator: config.separator,
    decimal: config.decimal,
  }).format();
}

// ─── Date Formatting ────────────────────────────────────────────────────────

/**
 * Format an ISO date string to a human-friendly display.
 * e.g. formatDate("2026-05-18") → "May 18, 2026"
 */
export function formatDate(isoDateString: string): string {
  const date = new Date(isoDateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format a date into a short readable string (e.g., "18 May")
 */
export function formatDateShort(isoDateString: string): string {
  const date = new Date(isoDateString);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short'
  });
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

/**
 * Generate a text-based progress bar.
 * e.g. progressBar(80, 10) → "████████░░"
 */
export function progressBar(percent: number, width: number = 10): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format a percentage for display.
 * e.g. formatPercent(80.5) → "81%"
 */
export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

/**
 * Format a number with compact notation for large amounts.
 * e.g. compactAmount(5000000, "IDR") → "Rp5,000k"
 */
export function compactAmount(amount: number, currencyCode: string): string {
  if (amount >= 1_000_000) {
    return formatCurrency(amount / 1_000, currencyCode).replace(/\.?0+$/, '') + 'k';
  }
  return formatCurrency(amount, currencyCode);
}

/**
 * Generate a short ID from a UUID (first 6 characters).
 */
export function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').substring(0, 6);
}
