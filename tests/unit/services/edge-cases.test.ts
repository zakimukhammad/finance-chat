import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionService } from '../../../src/services/transaction';
import { WalletService } from '../../../src/services/wallet';
import { MAX_AMOUNT } from '../../../src/utils/constants';

// Mock CurrencyService
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
  or: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

describe('Transaction Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Amount validation', () => {
    it('rejects amount = 0 with friendly message', async () => {
      await expect(
        TransactionService.create({
          type: 'expense',
          amount: 0,
          currency: 'USD',
          category_id: 'cat-1',
          date: '2026-05-29',
        })
      ).rejects.toThrow('Amount must be a positive number.');
    });

    it('rejects negative amount with friendly message', async () => {
      await expect(
        TransactionService.create({
          type: 'expense',
          amount: -50,
          currency: 'USD',
          category_id: 'cat-1',
          date: '2026-05-29',
        })
      ).rejects.toThrow('Amount must be a positive number.');
    });

    it('rejects amount > 999,999,999 with friendly message', async () => {
      await expect(
        TransactionService.create({
          type: 'expense',
          amount: MAX_AMOUNT + 1,
          currency: 'USD',
          category_id: 'cat-1',
          date: '2026-05-29',
        })
      ).rejects.toThrow(`Amount cannot exceed ${MAX_AMOUNT.toLocaleString()}.`);
    });

    it('accepts amount at MAX_AMOUNT boundary', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-1', type: 'expense', amount: MAX_AMOUNT },
        error: null,
      });
      vi.spyOn(WalletService, 'adjustBalance').mockResolvedValue(undefined as any);

      await expect(
        TransactionService.create({
          type: 'expense',
          amount: MAX_AMOUNT,
          currency: 'USD',
          category_id: 'cat-1',
          date: '2026-05-29',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Transfer validation', () => {
    it('rejects transfer to same wallet', async () => {
      await expect(
        TransactionService.create({
          type: 'transfer',
          amount: 100,
          currency: 'USD',
          wallet_id: 'wallet-1',
          to_wallet_id: 'wallet-1',
          date: '2026-05-29',
        })
      ).rejects.toThrow('From and To wallet must be different.');
    });

    it('allows transfer that exceeds wallet balance (no hard block — overdraft valid)', async () => {
      // Transfer 1000 from a wallet that only has 500
      // Per TRD: "warn but allow (no hard block — cash overdraft is valid)"
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'tx-1', type: 'transfer', amount: 1000 },
        error: null,
      });

      const adjustSpy = vi.spyOn(WalletService, 'adjustBalance').mockResolvedValue(undefined as any);

      await expect(
        TransactionService.create({
          type: 'transfer',
          amount: 1000,
          currency: 'USD',
          wallet_id: 'wallet-1',
          to_wallet_id: 'wallet-2',
          date: '2026-05-29',
        })
      ).resolves.not.toThrow();

      // Balance adjustments should be called (not blocked)
      expect(adjustSpy).toHaveBeenCalledWith('wallet-1', -1000);
      expect(adjustSpy).toHaveBeenCalledWith('wallet-2', 1000);
    });
  });

  describe('Wallet deletion with transactions', () => {
    it('blocks deletion when wallet has transactions', async () => {
      mockSupabase.or.mockResolvedValueOnce({ count: 5, error: null, data: null });

      await expect(WalletService.delete('wallet-1')).rejects.toThrow(
        'Cannot delete — wallet has 5 transactions.'
      );
    });

    it('allows deletion when wallet has no transactions', async () => {
      mockSupabase.or.mockResolvedValueOnce({ count: 0, error: null });
      mockSupabase.eq.mockResolvedValueOnce({ error: null });

      await expect(WalletService.delete('wallet-1')).resolves.not.toThrow();
    });
  });
});

describe('Rate Limiter', () => {
  it('allows messages under the limit', async () => {
    const { rateLimiter, _resetRateLimitMap, _getRateCount } = await import('../../../src/bot/middleware/rateLimiter');
    _resetRateLimitMap();

    let nextCalled = false;
    const mockCtx = { from: { id: 12345 } } as any;
    const mockNext = () => { nextCalled = true; return Promise.resolve(); };

    await rateLimiter(mockCtx, mockNext);
    expect(nextCalled).toBe(true);
    expect(_getRateCount(12345)).toBe(1);
  });

  it('drops messages over the rate limit', async () => {
    const { rateLimiter, _resetRateLimitMap, _getRateCount } = await import('../../../src/bot/middleware/rateLimiter');
    _resetRateLimitMap();

    const mockCtx = { from: { id: 99999 } } as any;
    let callCount = 0;
    const mockNext = () => { callCount++; return Promise.resolve(); };

    // Send 12 messages rapidly
    for (let i = 0; i < 12; i++) {
      await rateLimiter(mockCtx, mockNext);
    }

    // Only 10 should have passed through
    expect(callCount).toBe(10);
    expect(_getRateCount(99999)).toBe(12);
  });
});
