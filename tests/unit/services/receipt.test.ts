import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiptService } from '../../../src/services/receipt';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => {
      return {
        getGenerativeModel: mockGetGenerativeModel,
      };
    }),
  };
});

describe('ReceiptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'mock-api-key';
  });

  it('parses a receipt successfully with clean JSON', async () => {
    const mockResponse = {
      intent: 'LOG_EXPENSE',
      amount: 125000,
      currency: 'IDR',
      category_hint: 'Makanan',
      description: 'Starbucks Coffee',
      date: '2026-06-15',
      confidence: 0.95,
    };

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify(mockResponse),
      },
    });

    const buffer = Buffer.from('fake-image-data');
    const result = await ReceiptService.parseReceipt(buffer, 'image/jpeg', 'IDR', 'Asia/Jakarta');

    expect(result).not.toBeNull();
    expect(result!.amount).toBe(125000);
    expect(result!.description).toBe('Starbucks Coffee');
    expect(result!.currency).toBe('IDR');
    expect(result!.date).toBe('2026-06-15');
    expect(result!.confidence).toBe(0.95);
  });

  it('parses a receipt successfully with markdown code block fences in output', async () => {
    const mockResponse = {
      intent: 'LOG_EXPENSE',
      amount: 15.5,
      currency: 'USD',
      category_hint: 'Groceries',
      description: 'Walmart',
      date: '2026-06-16',
      confidence: 0.92,
    };

    const fencedText = `\`\`\`json\n${JSON.stringify(mockResponse)}\n\`\`\``;

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => fencedText,
      },
    });

    const buffer = Buffer.from('fake-image-data');
    const result = await ReceiptService.parseReceipt(buffer, 'image/jpeg', 'IDR', 'Asia/Jakarta');

    expect(result).not.toBeNull();
    expect(result!.amount).toBe(15.5);
    expect(result!.description).toBe('Walmart');
    expect(result!.currency).toBe('USD');
  });

  it('applies default currency and date if missing in response', async () => {
    const mockResponse = {
      intent: 'LOG_EXPENSE',
      amount: 45000,
      category_hint: 'Transport',
      description: 'Grab Ride',
      confidence: 0.85,
    };

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify(mockResponse),
      },
    });

    const buffer = Buffer.from('fake-image-data');
    const result = await ReceiptService.parseReceipt(buffer, 'image/jpeg', 'EUR', 'Asia/Jakarta');

    expect(result).not.toBeNull();
    expect(result!.amount).toBe(45000);
    expect(result!.currency).toBe('EUR'); // defaulted
    expect(result!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // defaulted to today's date
  });

  it('returns null if response is empty or null', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'null',
      },
    });

    const buffer = Buffer.from('fake-image-data');
    const result = await ReceiptService.parseReceipt(buffer, 'image/jpeg', 'IDR', 'Asia/Jakarta');

    expect(result).toBeNull();
  });

  it('returns null and handles JSON parsing error gracefully', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'this is not json at all',
      },
    });

    const buffer = Buffer.from('fake-image-data');
    const result = await ReceiptService.parseReceipt(buffer, 'image/jpeg', 'IDR', 'Asia/Jakarta');

    expect(result).toBeNull();
  });

  it('returns null if GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;

    const buffer = Buffer.from('fake-image-data');
    const result = await ReceiptService.parseReceipt(buffer, 'image/jpeg', 'IDR', 'Asia/Jakarta');

    expect(result).toBeNull();
  });
});
