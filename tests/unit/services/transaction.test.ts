import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionService } from '../../../src/services/transaction';
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
  ilike: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
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
});
