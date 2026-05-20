import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecurringService } from '../../../src/services/recurring';
import { TransactionService } from '../../../src/services/transaction';
import * as client from '../../../src/db/client';

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  ilike: vi.fn().mockReturnThis(),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../../src/services/owner', () => ({
  OwnerService: {
    getOwner: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }),
  },
}));

vi.mock('../../../src/services/transaction', () => ({
  TransactionService: {
    create: vi.fn().mockResolvedValue({ id: 'mock-tx-123456' }),
  },
}));

describe('RecurringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    mockSupabase.insert.mockReset();
    mockSupabase.update.mockReset();
    mockSupabase.delete.mockReset();
    mockSupabase.select.mockReset();
    mockSupabase.eq.mockReset();
    mockSupabase.lte.mockReset();
    mockSupabase.order.mockReset();
    mockSupabase.limit.mockReset();
    mockSupabase.single.mockReset();
    mockSupabase.maybeSingle.mockReset();
    mockSupabase.ilike.mockReset();

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

  describe('add', () => {
    it('adds a recurring configuration successfully', async () => {
      const mockResult = {
        id: 'rec-uuid',
        description: 'Netflix',
        amount: 249000,
        type: 'expense',
        frequency: 'monthly',
        next_due_date: '2026-06-20',
        active: true,
      };
      mockSupabase.single.mockResolvedValueOnce({ data: mockResult, error: null });

      const res = await RecurringService.add({
        description: 'Netflix',
        amount: 249000,
        type: 'expense',
        category_id: 'cat-id',
        wallet_id: 'wallet-id',
        frequency: 'monthly',
        next_due_date: '2026-06-20',
      });

      expect(mockSupabase.insert).toHaveBeenCalledWith({
        description: 'Netflix',
        amount: 249000,
        type: 'expense',
        category_id: 'cat-id',
        wallet_id: 'wallet-id',
        to_wallet_id: null,
        frequency: 'monthly',
        next_due_date: '2026-06-20',
        active: true,
      });
      expect(res).toEqual(mockResult);
    });
  });

  describe('list', () => {
    it('returns recurring transactions ordered by created_at', async () => {
      const mockList = [
        { id: '1', description: 'Entry 1', created_at: '2026-01-01' },
        { id: '2', description: 'Entry 2', created_at: '2026-01-02' },
      ];
      mockSupabase.order.mockResolvedValueOnce({ data: mockList, error: null });

      const res = await RecurringService.list();

      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(res).toEqual(mockList);
    });
  });

  describe('getById', () => {
    it('fetches single entry by ID or short ID prefix match', async () => {
      const mockEntry = { id: 'rec-123456789', description: 'Entry' };
      mockSupabase.single.mockResolvedValueOnce({ data: mockEntry, error: null });

      const res = await RecurringService.getById('rec-12');

      expect(mockSupabase.ilike).toHaveBeenCalledWith('id', 'rec-12%');
      expect(res).toEqual(mockEntry);
    });
  });

  describe('delete', () => {
    it('deletes recurring configuration by ID', async () => {
      const mockEntry = { id: 'rec-123456789', description: 'Entry' };
      mockSupabase.single.mockResolvedValueOnce({ data: mockEntry, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      await expect(RecurringService.delete('rec-12')).resolves.not.toThrow();

      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'rec-123456789');
    });
  });

  describe('togglePause', () => {
    it('toggles the active flag', async () => {
      const mockEntry = { id: 'rec-123', description: 'Entry', active: true };
      const mockUpdated = { ...mockEntry, active: false };

      mockSupabase.single.mockResolvedValueOnce({ data: mockEntry, error: null }); // getById
      mockSupabase.single.mockResolvedValueOnce({ data: mockUpdated, error: null }); // update

      const res = await RecurringService.togglePause('rec-123');

      expect(mockSupabase.update).toHaveBeenCalledWith({ active: false });
      expect(res.active).toBe(false);
    });
  });

  describe('processDue', () => {
    it('processes due entries, creates transaction, advances date, and sends telegram pushes', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';

      const mockEntries = [
        {
          id: 'rec-daily-id',
          description: 'Daily Gym',
          amount: 50000,
          type: 'expense',
          frequency: 'daily',
          next_due_date: '2026-05-20',
          active: true,
          category: { name: 'Health', icon: '🏥' },
          wallet: { name: 'Cash', icon: '💵' },
        },
        {
          id: 'rec-weekly-id',
          description: 'Weekly Allowance',
          amount: 500000,
          type: 'income',
          frequency: 'weekly',
          next_due_date: '2026-05-20',
          active: true,
          category: null,
          wallet: null,
        },
        {
          id: 'rec-transfer-id',
          description: 'Monthly Savings Transfer',
          amount: 1000000,
          type: 'transfer',
          frequency: 'monthly',
          next_due_date: '2026-05-20',
          active: true,
          category: null,
          wallet: { name: 'BCA', icon: '🏦' },
          to_wallet: { name: 'GoPay', icon: '📱' },
        },
      ];

      mockSupabase.lte.mockResolvedValueOnce({ data: mockEntries, error: null });

      const mockSendMessage = vi.fn().mockResolvedValue({});
      const mockBot = {
        telegram: {
          sendMessage: mockSendMessage,
        },
      } as any;

      await RecurringService.processDue(mockBot);

      // Verify transaction creation was called for each due entry
      expect(TransactionService.create).toHaveBeenCalledTimes(3);

      // Verify date advancement update called for each
      expect(mockSupabase.update).toHaveBeenCalledTimes(3);

      // Check date math:
      // Daily: 2026-05-20 -> +1 day = 2026-05-21
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'rec-daily-id');
      expect(mockSupabase.update).toHaveBeenCalledWith({ next_due_date: '2026-05-21' });

      // Weekly: 2026-05-20 -> +7 days = 2026-05-27
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'rec-weekly-id');
      expect(mockSupabase.update).toHaveBeenCalledWith({ next_due_date: '2026-05-27' });

      // Monthly: 2026-05-20 -> +1 month = 2026-06-20
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'rec-transfer-id');
      expect(mockSupabase.update).toHaveBeenCalledWith({ next_due_date: '2026-06-20' });

      // Verify telegram sendMessage was called 3 times
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });
  });
});
