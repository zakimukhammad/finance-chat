import { Context, MiddlewareFn } from 'telegraf';
import { logger } from '../../utils/logger';
import { RATE_LIMIT_PER_MINUTE } from '../../utils/constants';

/**
 * Rate Limiter Middleware
 *
 * Tracks message count per minute per user (in-memory).
 * If a user exceeds RATE_LIMIT_PER_MINUTE (default 10), messages are silently dropped.
 * No error reply is sent — just soft-ignore.
 *
 * Cleanup of stale entries runs every 60 seconds.
 */

interface RateEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<number, RateEntry>();
const WINDOW_MS = 60_000; // 1 minute

// Cleanup stale entries every 60 seconds
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimitMap) {
    if (now - entry.windowStart > WINDOW_MS) {
      rateLimitMap.delete(userId);
    }
  }
}, WINDOW_MS);

// Allow Node to exit cleanly (don't keep process alive for this timer)
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

export const rateLimiter: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // New window
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return next();
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_PER_MINUTE) {
    // Soft-ignore: drop silently, no error reply
    logger.debug({ userId, count: entry.count }, 'Rate limit: dropping message');
    return;
  }

  return next();
};

/**
 * Exported for testing: reset the rate limit map.
 */
export function _resetRateLimitMap(): void {
  rateLimitMap.clear();
}

/**
 * Exported for testing: get current count for a user.
 */
export function _getRateCount(userId: number): number {
  const entry = rateLimitMap.get(userId);
  return entry?.count ?? 0;
}
