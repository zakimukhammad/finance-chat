import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetService } from '../../../src/services/budget';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../../src/services/owner', () => ({
  OwnerService: {
    getOwner: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }),
  },
}));

describe('BudgetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.upsert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.neq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
  });

  describe('set', () => {
    it('upserts correctly — inserts if not exists', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'b1', category_id: 'cat-food', amount: 500, period: 'monthly', alert_threshold: 80 },
        error: null,
      });

      const result = await BudgetService.set('cat-food', 500, 'monthly');

      expect(mockSupabase.from).toHaveBeenCalledWith('budgets');
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        { category_id: 'cat-food', amount: 500, period: 'monthly', alert_threshold: 80 },
        { onConflict: 'category_id' }
      );
      expect(result.amount).toBe(500);
    });

    it('upserts correctly — updates if exists', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'b1', category_id: 'cat-food', amount: 800, period: 'monthly', alert_threshold: 80 },
        error: null,
      });

      const result = await BudgetService.set('cat-food', 800, 'monthly');

      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        { category_id: 'cat-food', amount: 800, period: 'monthly', alert_threshold: 80 },
        { onConflict: 'category_id' }
      );
      expect(result.amount).toBe(800);
    });
  });

  describe('delete', () => {
    it('deletes budget for a category', async () => {
      mockSupabase.eq.mockResolvedValueOnce({ error: null });

      await expect(BudgetService.delete('cat-food')).resolves.not.toThrow();

      expect(mockSupabase.from).toHaveBeenCalledWith('budgets');
      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.eq).toHaveBeenCalledWith('category_id', 'cat-food');
    });
  });

  describe('resetAlertFlags', () => {
    it('clears alerted_80_at and alerted_100_at for all budgets', async () => {
      mockSupabase.neq.mockResolvedValueOnce({ error: null });

      await BudgetService.resetAlertFlags();

      expect(mockSupabase.from).toHaveBeenCalledWith('budgets');
      expect(mockSupabase.update).toHaveBeenCalledWith({ alerted_80_at: null, alerted_100_at: null });
    });
  });

  describe('checkAndAlert', () => {
    const createMockBot = () => ({
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    }) as any;

    it('triggers alert at 80% threshold', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';
      const mockBot = createMockBot();

      // Mock getStatus to return a budget at 85%
      mockSupabase.order.mockResolvedValueOnce({
        data: [{
          id: 'b1',
          category_id: 'cat-food',
          category_name: 'Food & Dining',
          icon: '🍔',
          budget_amount: 500,
          spent: 425,
          pct_used: 85,
          alert_threshold: 80,
          period: 'monthly',
          alerted_80_at: null,
          alerted_100_at: null,
        }],
        error: null,
      });

      // Mock the update for alerted_80_at
      mockSupabase.eq.mockResolvedValueOnce({ error: null });

      await BudgetService.checkAndAlert(mockBot);

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('Budget Alert'),
        { parse_mode: 'Markdown' }
      );
      expect(mockSupabase.update).toHaveBeenCalled();
    });

    it('triggers alert at 100% threshold', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';
      const mockBot = createMockBot();

      mockSupabase.order.mockResolvedValueOnce({
        data: [{
          id: 'b1',
          category_id: 'cat-food',
          category_name: 'Food & Dining',
          icon: '🍔',
          budget_amount: 500,
          spent: 550,
          pct_used: 110,
          alert_threshold: 80,
          period: 'monthly',
          alerted_80_at: '2026-05-15T00:00:00Z', // 80% already alerted
          alerted_100_at: null,
        }],
        error: null,
      });

      mockSupabase.eq.mockResolvedValueOnce({ error: null });

      await BudgetService.checkAndAlert(mockBot);

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('110%'),
        { parse_mode: 'Markdown' }
      );
    });

    it('does NOT trigger again if alerted_80_at is already set this month', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';
      const mockBot = createMockBot();

      mockSupabase.order.mockResolvedValueOnce({
        data: [{
          id: 'b1',
          category_id: 'cat-food',
          category_name: 'Food & Dining',
          icon: '🍔',
          budget_amount: 500,
          spent: 425,
          pct_used: 85,
          alert_threshold: 80,
          period: 'monthly',
          alerted_80_at: '2026-05-10T00:00:00Z', // Already sent
          alerted_100_at: null,
        }],
        error: null,
      });

      await BudgetService.checkAndAlert(mockBot);

      // Should NOT send any message
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT trigger if pct_used is below threshold', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';
      const mockBot = createMockBot();

      mockSupabase.order.mockResolvedValueOnce({
        data: [{
          id: 'b1',
          category_id: 'cat-food',
          category_name: 'Food & Dining',
          icon: '🍔',
          budget_amount: 500,
          spent: 200,
          pct_used: 40,
          alert_threshold: 80,
          period: 'monthly',
          alerted_80_at: null,
          alerted_100_at: null,
        }],
        error: null,
      });

      await BudgetService.checkAndAlert(mockBot);

      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });
});
