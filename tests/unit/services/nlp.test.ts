import { describe, it, expect, vi } from 'vitest';
import { NLPService } from '../../../src/services/nlp';
import { tryRegexFastPath, parseAmount, extractDate } from '../../../src/services/nlp/regexParser';
import { nlpTestCases } from '../../fixtures/nlpTestCases';

// Mock the AI calls to avoid network requests during unit tests
vi.mock('../../../src/services/nlp/geminiParser', () => ({
  callGemini: vi.fn(async (text: string) => {
    if (text.includes('salary of 5000')) {
      return { intent: 'LOG_INCOME', amount: 5000, currency: 'USD', date: '2026-05-18', confidence: 0.95 };
    }
    if (text.includes('cost me 150')) {
      return { intent: 'LOG_EXPENSE', amount: 150, currency: 'USD', date: '2026-05-18', confidence: 0.95 };
    }
    return null;
  })
}));

vi.mock('../../../src/services/nlp/groqParser', () => ({
  callGroq: vi.fn(async () => null)
}));

describe('Regex Fast-Path Parser', () => {
  it('parses amounts correctly', () => {
    expect(parseAmount('50k', 'spent 50k', 'IDR').amount).toBe(50000);
    expect(parseAmount('1.5k', 'spent 1.5k', 'USD').amount).toBe(1500);
    expect(parseAmount('Rp50000', 'bayar Rp50000', 'IDR').amount).toBe(50000);
    expect(parseAmount('$45', 'spent $45', 'IDR').currency).toBe('USD');
  });

  it('extracts relative dates correctly', () => {
    // Relative dates are evaluated against 'today', so we just check it returns a string
    const yesterday = extractDate('yesterday');
    expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('NLPService Integration (Fast-path + AI Mock)', () => {
  for (const tc of nlpTestCases) {
    it(`parses: "${tc.input}"`, async () => {
      const result = await NLPService.parse(tc.input, 'USD', 'UTC');
      
      if (tc.expectedIntent === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.intent).toBe(tc.expectedIntent);
        expect(result!.amount).toBe(tc.expectedAmount);
        
        if (tc.expectedCurrency) {
          expect(result!.currency).toBe(tc.expectedCurrency);
        }
      }
    });
  }
});
