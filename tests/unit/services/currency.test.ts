import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CurrencyService } from '../../../src/services/currency';
import axios from 'axios';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
  then: vi.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
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

describe('CurrencyService', () => {
  let axiosGetSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mockSupabase.then resolves to empty array to satisfy select without single
    mockSupabase.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
    
    // Spy on axios.get and mock its implementation
    axiosGetSpy = vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        rates: { EUR: 0.92, GBP: 0.8, IDR: 16000, SGD: 1.35, MYR: 4.7, JPY: 150 },
      },
    });
  });

  describe('convert', () => {
    it('returns the same amount if from and to are the same', async () => {
      const res = await CurrencyService.convert(100, 'USD', 'USD');
      expect(res).toBe(100);
    });

    it('returns converted amount based on cached rate', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ EUR: 0.92 }));
      const res = await CurrencyService.convert(100, 'USD', 'EUR');
      expect(res).toBe(92);
    });
  });

  describe('getRate', () => {
    it('checks Redis cache first', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ EUR: 0.92 }));
      const rate = await CurrencyService.getRate('USD', 'EUR');
      expect(rate).toBe(0.92);
      expect(mockRedis.get).toHaveBeenCalledWith('rates:USD');
    });

    it('falls back to DB on Redis cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockSupabase.single.mockResolvedValueOnce({
        data: { rate: '0.92' },
        error: null,
      });

      // Mock select for rebuild cache
      mockSupabase.then.mockImplementationOnce((resolve) => resolve({
        data: [{ target_currency: 'EUR', rate: 0.92 }],
        error: null,
      }));

      const rate = await CurrencyService.getRate('USD', 'EUR');
      expect(rate).toBe(0.92);
      expect(mockSupabase.eq).toHaveBeenCalledWith('base_currency', 'USD');
    });

    it('falls back to live API on cache & DB miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }, // Not found
      });

      axiosGetSpy.mockResolvedValueOnce({
        data: {
          rates: { EUR: 0.92 },
        },
      });

      const rate = await CurrencyService.getRate('USD', 'EUR');
      expect(rate).toBe(0.92);
      expect(axiosGetSpy).toHaveBeenCalledWith('https://api.frankfurter.app/latest?from=USD');
    });
  });

  describe('refreshRates', () => {
    it('calls API and upserts into DB and sets in Redis', async () => {
      mockSupabase.upsert.mockResolvedValue({ error: null });

      await CurrencyService.refreshRates();

      expect(axiosGetSpy).toHaveBeenCalledTimes(7); // once for each supported currency
      expect(mockSupabase.upsert).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });
});
