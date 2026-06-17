import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InsightService } from '../../../src/services/insight';

// ─── Mock all external dependencies ──────────────────────────────────────────

const mockGetByDateRange = vi.fn();
const mockGetSummary = vi.fn();
vi.mock('../../../src/services/transaction', () => ({
  TransactionService: {
    getByDateRange: (...args: any[]) => mockGetByDateRange(...args),
    getSummary: (...args: any[]) => mockGetSummary(...args),
  },
}));

const mockGetStatus = vi.fn();
vi.mock('../../../src/services/budget', () => ({
  BudgetService: {
    getStatus: () => mockGetStatus(),
  },
}));

const mockGoalList = vi.fn();
vi.mock('../../../src/services/goal', () => ({
  GoalService: {
    list: () => mockGoalList(),
  },
}));

const mockGetAll = vi.fn();
vi.mock('../../../src/services/category', () => ({
  CategoryService: {
    getAll: () => mockGetAll(),
  },
}));

const mockGetActiveWithLastTransaction = vi.fn();
vi.mock('../../../src/services/recurring', () => ({
  RecurringService: {
    getActiveWithLastTransaction: () => mockGetActiveWithLastTransaction(),
  },
}));

const mockGetOwner = vi.fn();
vi.mock('../../../src/services/owner', () => ({
  OwnerService: {
    getOwner: (...args: any[]) => mockGetOwner(...args),
  },
}));

// Mock Gemini
const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: mockGenerateContent,
    })),
  })),
}));

// Mock Groq (fallback)
vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Fallback insight' } }],
        }),
      },
    },
  })),
}));

// ─── Helper: default mock data ───────────────────────────────────────────────

function setupDefaultMocks() {
  process.env.OWNER_TELEGRAM_ID = '12345';
  process.env.GEMINI_API_KEY = 'mock-key';
  process.env.GROQ_API_KEY = 'mock-groq-key';

  mockGetOwner.mockResolvedValue({
    id: 'owner-1',
    telegram_id: 12345,
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    settings: {},
  });

  // Transactions: expenses spread across days of the week
  mockGetByDateRange.mockResolvedValue([
    { date: '2026-06-02', type: 'expense', amount: 50000, currency: 'IDR', amount_base: 50000, category_id: 'cat-food' },   // Selasa
    { date: '2026-06-03', type: 'expense', amount: 30000, currency: 'IDR', amount_base: 30000, category_id: 'cat-food' },   // Rabu
    { date: '2026-06-05', type: 'expense', amount: 100000, currency: 'IDR', amount_base: 100000, category_id: 'cat-shop' }, // Jumat
    { date: '2026-06-07', type: 'expense', amount: 200000, currency: 'IDR', amount_base: 200000, category_id: 'cat-shop' }, // Minggu
    { date: '2026-06-09', type: 'expense', amount: 25000, currency: 'IDR', amount_base: 25000, category_id: 'cat-trans' },  // Selasa
    { date: '2026-06-10', type: 'income', amount: 5000000, currency: 'IDR', amount_base: 5000000, category_id: null },
  ]);

  mockGetStatus.mockResolvedValue([
    { category_name: 'Makanan', budget_amount: 500000, spent: 80000, pct_used: 16 },
  ]);

  mockGoalList.mockResolvedValue([
    {
      id: 'goal-1',
      name: 'Beli Laptop',
      target_amount: 10000000,
      current_amount: 3000000,
      deadline: '2026-09-30',
      status: 'active',
    },
  ]);

  mockGetSummary.mockResolvedValue({
    period: '2026-05',
    total_income: 6000000,
    total_expense: 1200000,
    net: 4800000,
  });

  mockGetAll.mockResolvedValue([
    { id: 'cat-food', name: 'Makanan', icon: '🍔', type: 'expense' },
    { id: 'cat-shop', name: 'Belanja', icon: '🛍️', type: 'expense' },
    { id: 'cat-trans', name: 'Transport', icon: '🚗', type: 'expense' },
  ]);

  mockGetActiveWithLastTransaction.mockResolvedValue([
    {
      entry: {
        id: 'rec-1',
        description: 'Netflix',
        amount: 186000,
        type: 'expense',
        category_id: 'cat-shop',
        frequency: 'monthly',
        active: true,
        created_at: '2026-01-15T00:00:00Z',
        category: { name: 'Belanja', icon: '🛍️' },
      },
      lastTxnDate: '2026-04-15',
    },
    {
      entry: {
        id: 'rec-2',
        description: 'Spotify',
        amount: 55000,
        type: 'expense',
        category_id: 'cat-shop',
        frequency: 'monthly',
        active: true,
        created_at: '2026-02-01T00:00:00Z',
        category: { name: 'Belanja', icon: '🛍️' },
      },
      lastTxnDate: null, // Never had a matching transaction
    },
  ]);
}

describe('InsightService — Enhanced Data (Milestone 2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('menghasilkan insight dengan data subscription audit', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '🔍 Netflix belum aktif 2 bulan. Pertimbangkan cancel! 💰 Hemat Rp186.000/bulan.',
      },
    });

    const result = await InsightService.generate();
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    // Verify that Gemini was called with the enhanced payload
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const callArgs = mockGenerateContent.mock.calls[0][0];
    const promptText = callArgs.contents[0].parts[0].text;

    // Check that prompt includes subscription audit data
    expect(promptText).toContain('subscription_audit');
    expect(promptText).toContain('Netflix');
    expect(promptText).toContain('Spotify');
  });

  it('menghasilkan insight dengan data rata-rata pengeluaran harian', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '📊 Rata-rata pengeluaran harian Rp13.500 — turun dari Rp40.000 bulan lalu. Hebat!',
      },
    });

    const result = await InsightService.generate();
    expect(result).toBeTruthy();

    const promptText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(promptText).toContain('daily_spend_avg');
    expect(promptText).toContain('change_pct');
  });

  it('menghasilkan insight dengan data pengeluaran per hari', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '📅 Hari Minggu adalah hari paling boros! Belanja naik tajam setiap weekend.',
      },
    });

    const result = await InsightService.generate();
    expect(result).toBeTruthy();

    const promptText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(promptText).toContain('spending_by_day_of_week');
    expect(promptText).toContain('Minggu');
    expect(promptText).toContain('Senin');
  });

  it('menghasilkan insight dengan goal acceleration tips', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '🎯 Kurangi 20% belanja di 🛍️ Belanja dan capai target Beli Laptop 14 hari lebih cepat!',
      },
    });

    const result = await InsightService.generate();
    expect(result).toBeTruthy();

    const promptText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(promptText).toContain('goal_acceleration');
    expect(promptText).toContain('Beli Laptop');
    expect(promptText).toContain('suggested_cut_pct');
    expect(promptText).toContain('days_saved');
  });

  it('menangani kasus tanpa goal aktif (goal_acceleration kosong)', async () => {
    mockGoalList.mockResolvedValue([]);

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '📊 Pengeluaran Anda stabil bulan ini. Terus jaga!',
      },
    });

    const result = await InsightService.generate();
    expect(result).toBeTruthy();

    const promptText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(promptText).toContain('"goal_acceleration": []');
  });

  it('menangani kasus tanpa recurring entries (subscription_audit kosong)', async () => {
    mockGetActiveWithLastTransaction.mockResolvedValue([]);

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '💡 Tidak ada langganan aktif. Fokus pada pengeluaran harian Anda.',
      },
    });

    const result = await InsightService.generate();
    expect(result).toBeTruthy();

    const promptText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(promptText).toContain('"subscription_audit": []');
  });

  it('menangani kasus tanpa transaksi (spending day of week semua nol)', async () => {
    mockGetByDateRange.mockResolvedValue([]);

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '📊 Belum ada transaksi bulan ini. Mulai catat pengeluaran Anda!',
      },
    });

    const result = await InsightService.generate();
    expect(result).toBeTruthy();

    const promptText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    // All days should have avg_spend: 0
    expect(promptText).toContain('"avg_spend": 0');
  });

  it('fallback ke Groq jika Gemini gagal', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini quota exceeded'));

    const result = await InsightService.generate();
    expect(result).toBeTruthy();
    expect(result).toBe('Fallback insight');
  });

  it('membersihkan markdown code fences dari respons AI', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n📊 Insight teks\n```',
      },
    });

    const result = await InsightService.generate();
    expect(result).not.toContain('```');
  });
});
