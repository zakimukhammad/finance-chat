import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractDate } from '../../../src/services/nlp/regexParser';
import { formatISO, subDays, previousMonday } from 'date-fns';

describe('extractDate', () => {
  // Use a fixed "now" to make tests deterministic
  const realDate = Date;
  const fixedNow = new Date('2026-05-29T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('"yesterday" → today - 1 day', () => {
    const result = extractDate('spent 50 yesterday');
    const expected = formatISO(subDays(fixedNow, 1), { representation: 'date' });
    expect(result).toBe(expected); // 2026-05-28
  });

  it('"kemarin" → today - 1 day (Bahasa Indonesia)', () => {
    const result = extractDate('beli makan 25000 kemarin');
    const expected = formatISO(subDays(fixedNow, 1), { representation: 'date' });
    expect(result).toBe(expected); // 2026-05-28
  });

  it('"kemaren" → today - 1 day (Bahasa Indonesia variant)', () => {
    const result = extractDate('bayar 50000 kemaren');
    const expected = formatISO(subDays(fixedNow, 1), { representation: 'date' });
    expect(result).toBe(expected); // 2026-05-28
  });

  it('"3 days ago" → today - 3 days', () => {
    const result = extractDate('lunch 30 3 days ago');
    const expected = formatISO(subDays(fixedNow, 3), { representation: 'date' });
    expect(result).toBe(expected); // 2026-05-26
  });

  it('"5 hari lalu" → today - 5 days (Bahasa Indonesia)', () => {
    const result = extractDate('beli 100k 5 hari lalu');
    const expected = formatISO(subDays(fixedNow, 5), { representation: 'date' });
    expect(result).toBe(expected); // 2026-05-24
  });

  it('"last monday" → correct past Monday', () => {
    const result = extractDate('paid 100 last monday');
    const expected = formatISO(previousMonday(fixedNow), { representation: 'date' });
    expect(result).toBe(expected);
  });

  it('"2026-04-15" → 2026-04-15 (passthrough)', () => {
    const result = extractDate('spent 50 on 2026-04-15');
    expect(result).toBe('2026-04-15');
  });

  it('"today" → today', () => {
    const result = extractDate('coffee 5 today');
    const expected = formatISO(fixedNow, { representation: 'date' });
    expect(result).toBe(expected); // 2026-05-29
  });

  it('"this morning" → today', () => {
    const result = extractDate('coffee 5 this morning');
    const expected = formatISO(fixedNow, { representation: 'date' });
    expect(result).toBe(expected);
  });

  it('"tadi pagi" → today (Bahasa Indonesia)', () => {
    const result = extractDate('kopi 15000 tadi pagi');
    const expected = formatISO(fixedNow, { representation: 'date' });
    expect(result).toBe(expected);
  });

  it('DD/MM/YYYY format → correct ISO date', () => {
    const result = extractDate('spent 50 on 15/04/2026');
    expect(result).toBe('2026-04-15');
  });

  it('no date reference → defaults to today', () => {
    const result = extractDate('spent 50 on lunch');
    const expected = formatISO(fixedNow, { representation: 'date' });
    expect(result).toBe(expected);
  });
});
