import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoalService } from '../../../src/services/goal';
import * as client from '../../../src/db/client';

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('../../../src/db/redis', () => ({
  getRedis: () => mockRedis,
}));

vi.mock('../../../src/services/owner', () => ({
  OwnerService: {
    getOwner: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }),
  },
}));

describe('GoalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    mockSupabase.insert.mockReset();
    mockSupabase.update.mockReset();
    mockSupabase.delete.mockReset();
    mockSupabase.select.mockReset();
    mockSupabase.eq.mockReset();
    mockSupabase.order.mockReset();
    mockSupabase.not.mockReset();
    mockSupabase.limit.mockReset();
    mockSupabase.single.mockReset();
    mockSupabase.maybeSingle.mockReset();

    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.not.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);

    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
  });

  describe('create', () => {
    it('creates a goal successfully', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'de305d54-75b4-431b-adb2-eb6b9e546013', name: 'Laptop', target_amount: 1000, current_amount: 0, status: 'active' },
        error: null,
      });

      const goal = await GoalService.create('Laptop', 1000, null, '2026-12-31');

      expect(mockSupabase.insert).toHaveBeenCalledWith({
        name: 'Laptop',
        target_amount: 1000,
        current_amount: 0,
        wallet_id: null,
        deadline: '2026-12-31',
        status: 'active',
      });
      expect(goal.name).toBe('Laptop');
      expect(goal.target_amount).toBe(1000);
    });
  });

  describe('list', () => {
    it('returns goals in order', async () => {
      const mockGoals = [
        { id: '1', name: 'Goal 1', created_at: '2026-01-01' },
        { id: '2', name: 'Goal 2', created_at: '2026-01-02' },
      ];
      mockSupabase.order.mockResolvedValueOnce({ data: mockGoals, error: null });

      const goals = await GoalService.list();

      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(goals).toEqual(mockGoals);
    });
  });

  describe('update', () => {
    it('updates a goal successfully', async () => {
      // getByNameOrId mock
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 'de305d54-75b4-431b-adb2-eb6b9e546013', name: 'Laptop', target_amount: 1000, current_amount: 100, status: 'active' },
        error: null,
      });
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'de305d54-75b4-431b-adb2-eb6b9e546013', name: 'New Laptop', target_amount: 1200 },
        error: null,
      });

      const updated = await GoalService.update('de305d54-75b4-431b-adb2-eb6b9e546013', { name: 'New Laptop', target_amount: 1200 });

      expect(mockSupabase.update).toHaveBeenCalledWith({ name: 'New Laptop', target_amount: 1200 });
      expect(updated.name).toBe('New Laptop');
      expect(updated.target_amount).toBe(1200);
    });
  });

  describe('delete', () => {
    it('deletes a goal successfully', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 'de305d54-75b4-431b-adb2-eb6b9e546013', name: 'Laptop', target_amount: 1000, current_amount: 100, status: 'active' },
        error: null,
      });

      await expect(GoalService.delete('de305d54-75b4-431b-adb2-eb6b9e546013')).resolves.not.toThrow();
    });
  });

  describe('contribute', () => {
    it('adds funds to a goal without completing it', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'de305d54-75b4-431b-adb2-eb6b9e546013',
          name: 'Laptop',
          target_amount: 1000,
          current_amount: 100,
          status: 'active',
        },
        error: null,
      });
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'de305d54-75b4-431b-adb2-eb6b9e546013', current_amount: 300, status: 'active' },
        error: null,
      });

      const goal = await GoalService.contribute('de305d54-75b4-431b-adb2-eb6b9e546013', 200);

      expect(mockSupabase.update).toHaveBeenCalledWith({ current_amount: 300 });
      expect(goal.current_amount).toBe(300);
      expect(goal.status).toBe('active');
    });

    it('completes the goal when target is reached', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'de305d54-75b4-431b-adb2-eb6b9e546013',
          name: 'Laptop',
          target_amount: 1000,
          current_amount: 800,
          status: 'active',
        },
        error: null,
      });
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'de305d54-75b4-431b-adb2-eb6b9e546013', current_amount: 1000, status: 'completed' },
        error: null,
      });

      const goal = await GoalService.contribute('de305d54-75b4-431b-adb2-eb6b9e546013', 200);

      expect(mockSupabase.update).toHaveBeenCalledWith({ current_amount: 1000, status: 'completed' });
      expect(goal.current_amount).toBe(1000);
      expect(goal.status).toBe('completed');
    });
  });

  describe('sendDeadlineReminders', () => {
    it('sends reminders and sets redis key for 7 days left', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';

      const mockSendMessage = vi.fn().mockResolvedValue({});
      const mockBot = {
        telegram: {
          sendMessage: mockSendMessage,
        },
      } as any;

      const futureDate7 = new Date();
      futureDate7.setDate(futureDate7.getDate() + 7);
      const deadline7 = futureDate7.toISOString().split('T')[0];

      mockSupabase.not.mockResolvedValueOnce({
        data: [
          { id: 'goal-7', name: 'Laptop', target_amount: 1000, current_amount: 400, deadline: deadline7, status: 'active' },
        ],
        error: null,
      });

      mockRedis.get.mockResolvedValueOnce(null); // Not already sent

      await GoalService.sendDeadlineReminders(mockBot);

      expect(mockSendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('7 days left'),
        { parse_mode: 'Markdown' }
      );
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('sends reminders and sets redis key for tomorrow (1 day left)', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';

      const mockSendMessage = vi.fn().mockResolvedValue({});
      const mockBot = {
        telegram: {
          sendMessage: mockSendMessage,
        },
      } as any;

      const futureDate1 = new Date();
      futureDate1.setDate(futureDate1.getDate() + 1);
      const deadline1 = futureDate1.toISOString().split('T')[0];

      mockSupabase.not.mockResolvedValueOnce({
        data: [
          { id: 'goal-1', name: 'Vacation', target_amount: 2000, current_amount: 1800, deadline: deadline1, status: 'active' },
        ],
        error: null,
      });

      mockRedis.get.mockResolvedValueOnce(null); // Not already sent

      await GoalService.sendDeadlineReminders(mockBot);

      expect(mockSendMessage).toHaveBeenCalledWith(
        999999,
        expect.stringContaining('tomorrow'),
        { parse_mode: 'Markdown' }
      );
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('does not send reminder if already reminded today', async () => {
      process.env.OWNER_TELEGRAM_ID = '999999';

      const mockSendMessage = vi.fn().mockResolvedValue({});
      const mockBot = {
        telegram: {
          sendMessage: mockSendMessage,
        },
      } as any;

      const futureDate7 = new Date();
      futureDate7.setDate(futureDate7.getDate() + 7);
      const deadline7 = futureDate7.toISOString().split('T')[0];

      mockSupabase.not.mockResolvedValueOnce({
        data: [
          { id: 'goal-7', name: 'Laptop', target_amount: 1000, current_amount: 400, deadline: deadline7, status: 'active' },
        ],
        error: null,
      });

      mockRedis.get.mockResolvedValueOnce('1'); // ALREADY SENT TODAY

      await GoalService.sendDeadlineReminders(mockBot);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });
});
