import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecurringService } from '../../src/services/recurring';
import { BudgetService } from '../../src/services/budget';
import { TransactionService } from '../../src/services/transaction';

// ─── Mock Supabase ──────────────────────────────────────────────────────────

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  ilike: vi.fn().mockReturnThis(),
};

vi.mock('../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../src/services/owner', () => ({
  OwnerService: {
    getOwner: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }),
  },
}));

vi.mock('../../src/services/transaction', () => ({
  TransactionService: {
    create: vi.fn().mockResolvedValue({ id: 'mock-tx-id' }),
  },
}));

vi.mock('../../src/services/currency', () => ({
  CurrencyService: {
    convert: vi.fn(async (amount: number) => amount),
  },
}));

describe('Cron Integration: RecurringService.processDue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    mockSupabase.ilike.mockReturnValue(mockSupabase);
  });

  it('processes due entry → transaction created, next_due_date advanced', async () => {
    process.env.OWNER_TELEGRAM_ID = '999999';

    const dueEntries = [
      {
        id: 'rec-monthly-id',
        description: 'Netflix Subscription',
        amount: 15.99,
        type: 'expense',
        frequency: 'monthly',
        next_due_date: '2026-05-20',
        active: true,
        category: { name: 'Subscriptions', icon: '📱' },
        wallet: { name: 'BCA', icon: '🏦' },
      },
    ];

    mockSupabase.lte.mockResolvedValueOnce({ data: dueEntries, error: null });

    const mockBot = {
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await RecurringService.processDue(mockBot);

    // Transaction created
    expect(TransactionService.create).toHaveBeenCalledTimes(1);
    expect(TransactionService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        amount: 15.99,
        source: 'recurring',
        recurring_id: 'rec-monthly-id',
      })
    );

    // next_due_date advanced by 1 month
    expect(mockSupabase.update).toHaveBeenCalledWith({ next_due_date: '2026-06-20' });

    // Push notification sent
    expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no entries are due (future next_due_date)', async () => {
    process.env.OWNER_TELEGRAM_ID = '999999';

    mockSupabase.lte.mockResolvedValueOnce({ data: [], error: null });

    const mockBot = {
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await RecurringService.processDue(mockBot);

    expect(TransactionService.create).not.toHaveBeenCalled();
    expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
  });
});

describe('Cron Integration: BudgetService.checkAndAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.neq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  it('sends push message at 85% budget and sets alerted_80_at', async () => {
    process.env.OWNER_TELEGRAM_ID = '999999';

    // Mock getStatus
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

    // Mock the update
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    const mockBot = {
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await BudgetService.checkAndAlert(mockBot);

    expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
      999999,
      expect.stringContaining('Budget Alert'),
      { parse_mode: 'Markdown' }
    );
  });

  it('does NOT send duplicate alert when alerted_80_at is already set', async () => {
    process.env.OWNER_TELEGRAM_ID = '999999';

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
        alerted_80_at: '2026-05-15T00:00:00Z', // Already alerted
        alerted_100_at: null,
      }],
      error: null,
    });

    const mockBot = {
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await BudgetService.checkAndAlert(mockBot);

    // Should NOT send any message (dedup check)
    expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('second run does NOT send push again (dedup verified)', async () => {
    process.env.OWNER_TELEGRAM_ID = '999999';

    const budgetData = {
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
    };

    const mockBot = {
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    } as any;

    // First run: alert should fire
    mockSupabase.order.mockResolvedValueOnce({
      data: [{ ...budgetData }],
      error: null,
    });
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    await BudgetService.checkAndAlert(mockBot);
    expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);

    // Second run: alerted_80_at is now set
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);

    mockSupabase.order.mockResolvedValueOnce({
      data: [{ ...budgetData, alerted_80_at: '2026-05-29T00:00:00Z' }],
      error: null,
    });

    await BudgetService.checkAndAlert(mockBot);
    expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
  });
});
