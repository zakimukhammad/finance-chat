import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NudgeService } from '../../../src/services/nudge';
import { TransactionService } from '../../../src/services/transaction';
import { BudgetService } from '../../../src/services/budget';
import { GoalService } from '../../../src/services/goal';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

// Mock Redis client
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('../../../src/db/redis', () => ({
  getRedis: () => mockRedis,
}));

// Mock services
vi.mock('../../../src/services/owner', () => ({
  OwnerService: {
    getOwner: vi.fn().mockResolvedValue({ currency: 'IDR', timezone: 'Asia/Jakarta' }),
  },
}));

vi.mock('../../../src/services/transaction', () => ({
  TransactionService: {
    getByDateRange: vi.fn(),
    getSummary: vi.fn(),
  },
}));

vi.mock('../../../src/services/budget', () => ({
  BudgetService: {
    getCategoryStatus: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('../../../src/services/goal', () => ({
  GoalService: {
    list: vi.fn(),
  },
}));

describe('NudgeService', () => {
  const createMockBot = () => ({
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({}),
    },
  }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
  });

  describe('checkRecurringSuggestion', () => {
    it('suggests recurring transaction when logged 3+ times', async () => {
      const mockBot = createMockBot();
      
      // Mock transactions: 3 expenses with same description
      vi.mocked(TransactionService.getByDateRange).mockResolvedValue([
        { id: '1', amount: 50000, description: 'Netflix', source: 'manual' },
        { id: '2', amount: 50000, description: 'Netflix', source: 'manual' },
        { id: '3', amount: 50000, description: 'Netflix', source: 'manual' },
      ] as any);

      // Mock no existing recurring transactions
      mockSupabase.eq.mockResolvedValueOnce({ data: [], error: null });

      await NudgeService.checkRecurringSuggestion(mockBot, 999999, 'IDR');

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('Tips Pintar — Transaksi Rutin'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '✅ Jadikan Rutin' }),
                expect.objectContaining({ text: '❌ Abaikan' }),
              ]),
            ]),
          }),
        })
      );
    });

    it('does not suggest if already recurring or already notified in Redis', async () => {
      const mockBot = createMockBot();
      
      vi.mocked(TransactionService.getByDateRange).mockResolvedValue([
        { id: '1', amount: 50000, description: 'Netflix', source: 'manual' },
        { id: '2', amount: 50000, description: 'Netflix', source: 'manual' },
        { id: '3', amount: 50000, description: 'Netflix', source: 'manual' },
      ] as any);

      // Scenario A: already in DB
      mockSupabase.eq.mockResolvedValueOnce({ data: [{ description: 'Netflix' }], error: null });
      await NudgeService.checkRecurringSuggestion(mockBot, 999999, 'IDR');
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();

      // Scenario B: already notified in Redis
      mockSupabase.eq.mockResolvedValueOnce({ data: [], error: null });
      mockRedis.get.mockResolvedValueOnce('1');
      await NudgeService.checkRecurringSuggestion(mockBot, 999999, 'IDR');
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('checkRecurringSuggestionInline', () => {
    it('returns suggestion text inline if threshold hit', async () => {
      vi.mocked(TransactionService.getByDateRange).mockResolvedValue([
        { id: '1', amount: 50000, description: 'Netflix', source: 'manual' },
        { id: '2', amount: 50000, description: 'Netflix', source: 'manual' },
        { id: '3', amount: 50000, description: 'Netflix', source: 'manual' },
      ] as any);

      mockSupabase.eq.mockResolvedValueOnce({ data: [], error: null });
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await NudgeService.checkRecurringSuggestionInline('Netflix', 50000, 'IDR');
      expect(result).toContain('Jadikan rutin?');
    });
  });

  describe('checkBudgetSuggestion', () => {
    it('suggests budget if a category is the top spending category 2 months in a row and has no budget', async () => {
      const mockBot = createMockBot();

      // Current summary top category is 'cat-1' (total 500000)
      vi.mocked(TransactionService.getSummary).mockResolvedValueOnce({
        by_category: [{ category_id: 'cat-1', total: 500000 }],
      } as any);

      // Prior month summary top category is also 'cat-1' (total 450000)
      vi.mocked(TransactionService.getSummary).mockResolvedValueOnce({
        by_category: [{ category_id: 'cat-1', total: 450000 }],
      } as any);

      // Mock budget service says NO budget exists for 'cat-1'
      vi.mocked(BudgetService.getCategoryStatus).mockResolvedValueOnce(null);

      // Mock fetching category details
      mockSupabase.single.mockResolvedValueOnce({
        data: { name: 'Food', icon: '🍔' },
        error: null,
      });

      await NudgeService.checkBudgetSuggestion(mockBot, 999999, 'IDR');

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('Tips Pintar — Saran Anggaran'),
        expect.any(Object)
      );
    });
  });

  describe('checkGoalContributions', () => {
    it('nudges when active goal has no contributions for 14 days', async () => {
      const mockBot = createMockBot();

      // Goal created 20 days ago, no newer activity
      const past20Days = new Date();
      past20Days.setDate(past20Days.getDate() - 20);

      vi.mocked(GoalService.list).mockResolvedValue([
        {
          id: 'goal-1',
          name: 'Emergency Fund',
          target_amount: 10000000,
          current_amount: 2000000,
          status: 'active',
          created_at: past20Days.toISOString(),
        },
      ] as any);

      // Mock Redis having no activity key (so defaults to created_at)
      mockRedis.get.mockResolvedValueOnce(null); // last activity
      mockRedis.get.mockResolvedValueOnce(null); // dedup key

      await NudgeService.checkGoalContributions(mockBot, 999999, 'IDR');

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('Pengingat Target Tabungan'),
        expect.any(Object)
      );
    });
  });

  describe('checkEndOfMonthTip', () => {
    it('nudges when under budget in last 3 days of month', async () => {
      const mockBot = createMockBot();

      // Mock budget status showing under budget
      vi.mocked(BudgetService.getStatus).mockResolvedValue([
        {
          category_id: 'cat-1',
          category_name: 'Food',
          icon: '🍔',
          budget_amount: 1000000,
          spent: 800000,
          pct_used: 80,
        },
      ] as any);

      // Fake Date to be 29th of June (June has 30 days, so 1 day left)
      const fakeDate = new Date(2026, 5, 29); // June is month 5 (0-indexed)
      vi.useFakeTimers();
      vi.setSystemTime(fakeDate);

      await NudgeService.checkEndOfMonthTip(mockBot, 999999, 'IDR');

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('Tips Akhir Bulan'),
        expect.any(Object)
      );

      vi.useRealTimers();
    });
  });

  describe('checkSpendSpikeAlert', () => {
    it('alerts when category spending rises > 30% month-over-month', async () => {
      const mockBot = createMockBot();

      // Current month: Food = 1500000
      vi.mocked(TransactionService.getSummary).mockResolvedValueOnce({
        by_category: [{ category_id: 'cat-food', total: 1500000 }],
      } as any);

      // Prior month: Food = 1000000 (increase of 50% which is > 30%)
      vi.mocked(TransactionService.getSummary).mockResolvedValueOnce({
        by_category: [{ category_id: 'cat-food', total: 1000000 }],
      } as any);

      // Mock fetching category details
      mockSupabase.single.mockResolvedValueOnce({
        data: { name: 'Food', icon: '🍔' },
        error: null,
      });

      await NudgeService.checkSpendSpikeAlert(mockBot, 999999, 'IDR');

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('Peringatan Lonjakan Pengeluaran'),
        expect.any(Object)
      );
    });
  });
});
