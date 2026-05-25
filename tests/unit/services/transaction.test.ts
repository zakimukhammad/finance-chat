import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionService } from '../../../src/services/transaction';
import { WalletService } from '../../../src/services/wallet';
import * as client from '../../../src/db/client';

// Mock CurrencyService to avoid network calls and return a 1:1 rate
vi.mock('../../../src/services/currency', () => ({
  CurrencyService: {
    convert: vi.fn(async (amount: number) => amount),
    getRate: vi.fn(async () => 1.0),
  }
}));

// Mock Supabase client
const mockOwner = {
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { currency: 'USD' }, error: null }),
};

const mockSupabase = {
  from: vi.fn().mockImplementation((table) => {
    if (table === 'owner') return mockOwner;
    return mockSupabase;
  }),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

describe('TransactionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create with wallet adjustments', () => {
    it('adjusts balance for expense transaction', async () => {
      // Mock Transaction insertion
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-123', type: 'expense', amount: 50 },
        error: null,
      });

      // Spy on WalletService.adjustBalance
      const adjustSpy = vi.spyOn(WalletService, 'adjustBalance').mockResolvedValue(undefined as any);

      await TransactionService.create({
        type: 'expense',
        amount: 50,
        currency: 'USD',
        wallet_id: 'wallet-1',
        category_id: 'cat-1',
        date: '2026-05-19',
      });

      expect(adjustSpy).toHaveBeenCalledWith('wallet-1', -50);
    });

    it('adjusts balance for income transaction', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-456', type: 'income', amount: 100 },
        error: null,
      });

      const adjustSpy = vi.spyOn(WalletService, 'adjustBalance').mockResolvedValue(undefined as any);

      await TransactionService.create({
        type: 'income',
        amount: 100,
        currency: 'USD',
        wallet_id: 'wallet-1',
        category_id: 'cat-2',
        date: '2026-05-19',
      });

      expect(adjustSpy).toHaveBeenCalledWith('wallet-1', 100);
    });

    it('adjusts balances for transfer transaction', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-789', type: 'transfer', amount: 30 },
        error: null,
      });

      const adjustSpy = vi.spyOn(WalletService, 'adjustBalance').mockResolvedValue(undefined as any);

      await TransactionService.create({
        type: 'transfer',
        amount: 30,
        currency: 'USD',
        wallet_id: 'wallet-1',
        to_wallet_id: 'wallet-2',
        date: '2026-05-19',
      });

      expect(adjustSpy).toHaveBeenNthCalledWith(1, 'wallet-1', -30);
      expect(adjustSpy).toHaveBeenNthCalledWith(2, 'wallet-2', 30);
    });
  });

  describe('delete with wallet reversals', () => {
    it('reverses balances on transaction deletion', async () => {
      // Mock fetch before deletion
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-123', type: 'transfer', amount: 30, wallet_id: 'wallet-1', to_wallet_id: 'wallet-2' },
        error: null,
      });

      const adjustSpy = vi.spyOn(WalletService, 'adjustBalance').mockResolvedValue(undefined as any);

      await TransactionService.delete('tx-123');

      // Check reversal logic (+30 to source, -30 to target)
      expect(adjustSpy).toHaveBeenNthCalledWith(1, 'wallet-1', 30);
      expect(adjustSpy).toHaveBeenNthCalledWith(2, 'wallet-2', -30);
    });
  });

  describe('update with wallet adjustments and reversals', () => {
    it('reverses old balance and applies new balance on amount edit', async () => {
      // 1st call to single(): fetch original
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-123', type: 'expense', amount: 50, wallet_id: 'wallet-1' },
        error: null,
      });
      // 2nd call to single(): return updated transaction
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-123', type: 'expense', amount: 80, wallet_id: 'wallet-1' },
        error: null,
      });

      const adjustSpy = vi.spyOn(WalletService, 'adjustBalance').mockResolvedValue(undefined as any);

      await TransactionService.update('tx-123', { amount: 80 });

      // Verify that reversal is done with +50, and new adjustment with -80
      expect(adjustSpy).toHaveBeenNthCalledWith(1, 'wallet-1', 50);
      expect(adjustSpy).toHaveBeenNthCalledWith(2, 'wallet-1', -80);
    });
  });

  describe('getHistory', () => {
    it('successfully queries transactions with category and wallet associations', async () => {
      const mockData = [
        {
          id: 'tx-123',
          type: 'expense',
          amount: 50,
          category: { name: 'Food', icon: '🍔' },
          wallet: { name: 'Cash', icon: '💵' },
        },
      ];
      mockSupabase.range.mockResolvedValueOnce({
        data: mockData,
        error: null,
      });

      const result = await TransactionService.getHistory(5);

      expect(mockSupabase.from).toHaveBeenCalledWith('transactions');
      expect(mockSupabase.select).toHaveBeenCalledWith('*, category:categories(name, icon), wallet:wallets!wallet_id(name, icon)');
      expect(result).toEqual(mockData);
    });
  });
});
