import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisInstance: Redis | null = null;

/**
 * Get or create the Redis client singleton.
 * Connects to Upstash Redis via the REDIS_URL env var.
 */
export function getRedis(): Redis {
  if (redisInstance) return redisInstance;

  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error('Missing REDIS_URL environment variable');
  }

  redisInstance = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 3) {
        logger.error('Redis: max retries reached, giving up');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redisInstance.on('connect', () => {
    logger.info('Redis connected');
  });

  redisInstance.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  return redisInstance;
}

/**
 * Test the Redis connection with a SET/GET round trip.
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.connect();
    const testKey = 'financebot:healthcheck';
    await redis.set(testKey, 'ok', 'EX', 10);
    const result = await redis.get(testKey);
    if (result !== 'ok') {
      throw new Error(`Redis health check failed: expected 'ok', got '${result}'`);
    }
    logger.info('Redis connection verified');
    return true;
  } catch (err) {
    logger.error({ err }, 'Redis connection test failed');
    return false;
  }
}

/**
 * Gracefully disconnect Redis.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('Redis disconnected');
  }
}
