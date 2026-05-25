import axios from 'axios';
import { getSupabase } from '../db/client';
import { getRedis } from '../db/redis';
import { logger } from '../utils/logger';
import { CURRENCIES } from '../utils/constants';
import currency from 'currency.js';

export class CurrencyService {
  /**
   * Refresh exchange rates from frankfurter.app for all supported currencies.
   * Updates Supabase DB and Redis cache.
   */
  static async refreshRates(): Promise<void> {
    const codes = CURRENCIES.map(c => c.code);
    logger.info('Refreshing exchange rates for: %o', codes);

    for (const base of codes) {
      try {
        const response = await axios.get(`https://api.frankfurter.app/latest?from=${base}`);
        const data = response.data;
        if (!data || !data.rates) {
          throw new Error(`Invalid response format from Frankfurter for base ${base}`);
        }

        const ratesMap: Record<string, number> = { [base]: 1.0 };
        const fetchedAt = new Date().toISOString();

        // Prepare batch upsert for Supabase
        const upsertRows = [
          {
            base_currency: base,
            target_currency: base,
            rate: 1.0,
            fetched_at: fetchedAt,
          }
        ];

        for (const target of codes) {
          if (target === base) continue;
          const rate = data.rates[target];
          if (rate !== undefined) {
            ratesMap[target] = rate;
            upsertRows.push({
              base_currency: base,
              target_currency: target,
              rate: rate,
              fetched_at: fetchedAt,
            });
          }
        }

        // Upsert into Supabase
        const { error } = await getSupabase()
          .from('exchange_rates')
          .upsert(upsertRows, { onConflict: 'base_currency,target_currency' });

        if (error) {
          logger.error({ error, base }, 'Failed to upsert exchange rates to DB');
          throw error;
        }

        // Cache in Redis key "rates:{base}" TTL 25 hours
        const redis = getRedis();
        const redisKey = `rates:${base}`;
        await redis.set(redisKey, JSON.stringify(ratesMap), 'EX', 25 * 60 * 60); // 25 hours

        logger.info(`Successfully refreshed rates for base currency ${base}`);
      } catch (err) {
        logger.error({ err, base }, `Error refreshing exchange rates for base currency ${base}`);
      }
    }
  }

  /**
   * Get the conversion rate between base and target currency.
   * Checks Redis cache, falls back to DB, and then live API.
   */
  static async getRate(base: string, target: string): Promise<number> {
    if (base === target) return 1.0;

    const redis = getRedis();
    const redisKey = `rates:${base}`;

    // 1. Try Redis cache
    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        const rates = JSON.parse(cached);
        if (rates[target] !== undefined) {
          return rates[target];
        }
      }
    } catch (err) {
      logger.warn({ err, base, target }, 'Failed to read exchange rate from Redis');
    }

    // 2. Try Database
    try {
      const { data, error } = await getSupabase()
        .from('exchange_rates')
        .select('rate')
        .eq('base_currency', base)
        .eq('target_currency', target)
        .single();

      if (!error && data) {
        // Rebuild Redis cache for this base in the background or immediately
        this.rebuildRedisCache(base).catch(err => {
          logger.warn({ err, base }, 'Failed to rebuild Redis exchange rate cache in background');
        });
        return Number(data.rate);
      }
    } catch (err) {
      logger.warn({ err, base, target }, 'Failed to query exchange rate from DB');
    }

    // 3. Fallback: Fetch Live
    try {
      logger.info({ base, target }, 'Cache and DB miss for exchange rate. Fetching live rate.');
      const response = await axios.get(`https://api.frankfurter.app/latest?from=${base}`);
      const data = response.data;
      if (data && data.rates && data.rates[target] !== undefined) {
        const rate = data.rates[target];
        
        // Cache this fetched rate (and other rates for base) to DB & Redis in background
        this.saveRatesToDbAndRedis(base, data.rates).catch(err => {
          logger.warn({ err, base }, 'Failed to save fetched rates to DB/Redis in background');
        });

        return rate;
      }
    } catch (err) {
      logger.error({ err, base, target }, 'Failed to fetch live exchange rate');
    }

    throw new Error(`Exchange rate not found from ${base} to ${target}`);
  }

  /**
   * Convert an amount from one currency to another using currency.js.
   */
  static async convert(amount: number, from: string, to: string): Promise<number> {
    if (from === to) return amount;
    const rate = await this.getRate(from, to);
    return currency(amount).multiply(rate).value;
  }

  /**
   * Rebuild Redis cache for a base currency from Database.
   */
  private static async rebuildRedisCache(base: string): Promise<void> {
    const { data, error } = await getSupabase()
      .from('exchange_rates')
      .select('target_currency, rate')
      .eq('base_currency', base);

    if (error || !data) return;

    const ratesMap: Record<string, number> = { [base]: 1.0 };
    for (const row of data) {
      ratesMap[row.target_currency] = Number(row.rate);
    }

    const redis = getRedis();
    await redis.set(`rates:${base}`, JSON.stringify(ratesMap), 'EX', 25 * 60 * 60);
  }

  /**
   * Save fetched rates for a base currency to DB and Redis.
   */
  private static async saveRatesToDbAndRedis(base: string, rawRates: Record<string, number>): Promise<void> {
    const codes = CURRENCIES.map(c => c.code);
    const fetchedAt = new Date().toISOString();
    
    const ratesMap: Record<string, number> = { [base]: 1.0 };
    const upsertRows = [
      {
        base_currency: base,
        target_currency: base,
        rate: 1.0,
        fetched_at: fetchedAt,
      }
    ];

    for (const target of codes) {
      if (target === base) continue;
      const rate = rawRates[target];
      if (rate !== undefined) {
        ratesMap[target] = rate;
        upsertRows.push({
          base_currency: base,
          target_currency: target,
          rate: rate,
          fetched_at: fetchedAt,
        });
      }
    }

    await getSupabase()
      .from('exchange_rates')
      .upsert(upsertRows, { onConflict: 'base_currency,target_currency' });

    const redis = getRedis();
    await redis.set(`rates:${base}`, JSON.stringify(ratesMap), 'EX', 25 * 60 * 60);
  }
}
