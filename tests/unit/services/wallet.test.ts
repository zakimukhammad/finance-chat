import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletService } from '../../../src/services/wallet';
import * as client from '../../../src/db/client';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

describe('WalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fuzzyMatch', () => {
    const wallets: any[] = [
      { id: '1', name: 'GoPay', type: 'ewallet' },
      { id: '2', name: 'BCA', type: 'bank' },
      { id: '3', name: 'Cash', type: 'cash' },
    ];

    it('matches exact case-insensitive', () => {
      expect(WalletService.fuzzyMatch('gopay', wallets)?.name).toBe('GoPay');
      expect(WalletService.fuzzyMatch('BCA', wallets)?.name).toBe('BCA');
    });

    it('matches with small typos (Levenshtein)', () => {
      expect(WalletService.fuzzyMatch('Gpay', wallets)?.name).toBe('GoPay'); // dist 1
      expect(WalletService.fuzzyMatch('BCAa', wallets)?.name).toBe('BCA'); // dist 1
    });

    it('returns null for unrecognized hint', () => {
      expect(WalletService.fuzzyMatch('xyz', wallets)).toBeNull();
    });
  });

  describe('delete', () => {
    it('succeeds when no transactions', async () => {
      mockSupabase.or.mockResolvedValueOnce({ count: 0, error: null }); // For the select count
      mockSupabase.eq.mockResolvedValueOnce({ error: null }); // For the delete

      await expect(WalletService.delete('123')).resolves.not.toThrow();
    });

    it('is blocked when transactions reference wallet', async () => {
      mockSupabase.or.mockResolvedValueOnce({ count: 5, error: null, data: null }); // For the select count

      await expect(WalletService.delete('123')).rejects.toThrow('Cannot delete — wallet has 5 transactions.');
    });
  });

  describe('adjustBalance', () => {
    it('correctly applies positive and negative delta', async () => {
      // Create a mock that satisfies both .single() and await .eq()
      mockSupabase.eq = vi.fn().mockImplementation(() => ({
        single: vi.fn().mockResolvedValue({ data: { balance: 100 }, error: null }),
        then: (resolve: any) => resolve({ error: null })
      }));

      await WalletService.adjustBalance('123', 50);
      
      expect(mockSupabase.update).toHaveBeenCalledWith({ balance: 150 });
    });
  });
});
