import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, progressBar, shortId, formatPercent } from '../../../src/utils/formatters';

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(4.50, 'USD')).toBe('$4.50');
  });

  it('formats IDR correctly (no decimals)', () => {
    expect(formatCurrency(50000, 'IDR')).toBe('Rp50,000');
  });

  it('formats EUR correctly', () => {
    expect(formatCurrency(29.99, 'EUR')).toBe('€29.99');
  });

  it('formats large IDR amounts', () => {
    expect(formatCurrency(5000000, 'IDR')).toBe('Rp5,000,000');
  });

  it('formats zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });
});

describe('formatDate', () => {
  it('formats ISO date to human-readable', () => {
    expect(formatDate('2026-05-18')).toBe('May 18, 2026');
  });

  it('formats another date', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  });
});

describe('progressBar', () => {
  it('generates 80% bar with width 10', () => {
    expect(progressBar(80, 10)).toBe('████████░░');
  });

  it('generates 0% bar', () => {
    expect(progressBar(0, 10)).toBe('░░░░░░░░░░');
  });

  it('generates 100% bar', () => {
    expect(progressBar(100, 10)).toBe('██████████');
  });

  it('clamps values above 100', () => {
    expect(progressBar(150, 10)).toBe('██████████');
  });

  it('clamps values below 0', () => {
    expect(progressBar(-10, 10)).toBe('░░░░░░░░░░');
  });

  it('works with different widths', () => {
    expect(progressBar(50, 6)).toBe('███░░░');
  });
});

describe('formatPercent', () => {
  it('rounds to integer', () => {
    expect(formatPercent(80.5)).toBe('81%');
  });

  it('formats whole number', () => {
    expect(formatPercent(42)).toBe('42%');
  });
});

describe('shortId', () => {
  it('returns first 6 chars of UUID without dashes', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(shortId(uuid)).toBe('a1b2c3');
  });
});
