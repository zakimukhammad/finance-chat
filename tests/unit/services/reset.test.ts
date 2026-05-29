import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetService } from '../../../src/services/resetService';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  then: vi.fn().mockImplementation((resolve) => resolve({ error: null })),
};

vi.mock('../../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

describe('ResetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes from all tables in order', async () => {
    const telegramId = 123456789;

    await expect(ResetService.resetAllData(telegramId)).resolves.not.toThrow();

    // Verify .from was called for transactions, budgets, recurring_transactions, goals, wallets, and owner
    expect(mockSupabase.from).toHaveBeenCalledWith('transactions');
    expect(mockSupabase.from).toHaveBeenCalledWith('budgets');
    expect(mockSupabase.from).toHaveBeenCalledWith('recurring_transactions');
    expect(mockSupabase.from).toHaveBeenCalledWith('goals');
    expect(mockSupabase.from).toHaveBeenCalledWith('wallets');
    expect(mockSupabase.from).toHaveBeenCalledWith('owner');

    // Verify delete filter for owner uses correct telegram ID
    expect(mockSupabase.eq).toHaveBeenCalledWith('telegram_id', telegramId);

    // Verify delete filter for generic tables uses correct non-null UUID
    expect(mockSupabase.neq).toHaveBeenCalledWith('id', '00000000-0000-0000-0000-000000000000');
    expect(mockSupabase.neq).toHaveBeenCalledWith('category_id', '00000000-0000-0000-0000-000000000000');
  });

  it('throws error if a deletion fails', async () => {
    const telegramId = 123456789;

    // Simulate error on transactions deletion
    mockSupabase.then.mockImplementationOnce((resolve) => 
      resolve({ error: new Error('Database connection failed') })
    );

    await expect(ResetService.resetAllData(telegramId)).rejects.toThrow('Database connection failed');
  });
});
