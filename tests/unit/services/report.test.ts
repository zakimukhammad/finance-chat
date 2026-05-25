import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportService } from '../../../src/services/report';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  then: vi.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

// Mock S3 Client
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => {
      return {
        send: vi.fn().mockResolvedValue({}),
      };
    }),
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
  };
});

// Mock S3 request presigner
vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: vi.fn().mockResolvedValue('https://mock-r2-url.com/file'),
  };
});

// Mock GoalService
vi.mock('../../../src/services/goal', () => {
  return {
    GoalService: {
      list: vi.fn().mockResolvedValue([
        {
          name: 'Laptop Savings',
          target_amount: 1500,
          current_amount: 500,
          status: 'active',
          deadline: '2026-12-31',
        }
      ]),
    },
  };
});

describe('ReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateCSV', () => {
    it('returns a formatted CSV string as Buffer', async () => {
      // Mock Supabase select results for transactions
      const mockTransactions = [
        {
          date: '2026-05-10',
          description: 'Groceries',
          type: 'expense',
          amount: 50,
          currency: 'USD',
          amount_base: 50,
          category: { name: 'Food & Dining' }
        },
        {
          date: '2026-05-09',
          description: 'Salary',
          type: 'income',
          amount: 2000,
          currency: 'USD',
          amount_base: 2000,
          category: { name: 'Salary' }
        },
        {
          date: '2026-05-08',
          description: 'Wallet Transfer',
          type: 'transfer',
          amount: 100,
          currency: 'USD',
          amount_base: 100,
          category: null
        }
      ];

      mockSupabase.then.mockImplementationOnce((resolve) => resolve({
        data: mockTransactions,
        error: null,
      }));

      const buffer = await ReportService.generateCSV('2026-05');
      expect(buffer).toBeInstanceOf(Buffer);

      const csvString = buffer.toString('utf-8');
      expect(csvString).toContain('Date,Description,Category,Type,Amount,Currency,Amount (Base)');
      expect(csvString).toContain('2026-05-10,Groceries,Food & Dining,expense,50,USD,50');
      expect(csvString).toContain('2026-05-09,Salary,Salary,income,2000,USD,2000');
      expect(csvString).toContain('2026-05-08,Wallet Transfer,Transfer,transfer,100,USD,100'); // Note: CSV format escaping handles spaces, Transfer is replaced
    });
  });

  describe('generatePDF', () => {
    it('generates a valid PDF buffer', async () => {
      const mockMonthTransactions = [
        {
          id: 't1',
          type: 'expense',
          amount: 50,
          currency: 'USD',
          amount_base: 50,
          category_id: 'c1',
          date: '2026-05-15',
          category: { name: 'Food', icon: '🍔', color: '#ff0000' }
        },
        {
          id: 't2',
          type: 'income',
          amount: 1000,
          currency: 'USD',
          amount_base: 1000,
          category_id: 'c2',
          date: '2026-05-01',
          category: { name: 'Salary', icon: '💵', color: '#00ff00' }
        }
      ];

      const mockBudgets = [
        {
          id: 'b1',
          category_id: 'c1',
          amount: 500,
          period: 'monthly',
          category: { name: 'Food', icon: '🍔' }
        }
      ];

      mockSupabase.then
        .mockImplementationOnce((resolve) => resolve({ data: { currency: 'USD' }, error: null }))
        .mockImplementationOnce((resolve) => resolve({ data: mockMonthTransactions, error: null }))
        .mockImplementationOnce((resolve) => resolve({ data: [{ amount_base: 800, amount: 800 }], error: null }))
        .mockImplementationOnce((resolve) => resolve({ data: mockBudgets, error: null }));

      const buffer = await ReportService.generatePDF('2026-05');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('uploadToR2', () => {
    it('uploads to S3 and returns a presigned URL', async () => {
      const buffer = Buffer.from('dummy data');
      const url = await ReportService.uploadToR2('test_file.csv', buffer, 'text/csv');
      
      expect(url).toBe('https://mock-r2-url.com/file');
    });
  });
});
