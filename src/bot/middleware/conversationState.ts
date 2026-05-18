import { Context, MiddlewareFn } from 'telegraf';
import { getRedis } from '../../db/redis';
import { logger } from '../../utils/logger';
import { CONVERSATION_STATE_TTL } from '../../utils/constants';
import type { ConversationState } from '../../types';

const REDIS_PREFIX = 'financebot:conv:';

/**
 * Conversation State Middleware
 *
 * Loads conversation state from Redis at the start of each update
 * and provides helpers to get/set/clear state on the context.
 */
export const conversationState: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const redis = getRedis();
  const key = `${REDIS_PREFIX}${userId}`;

  // Load existing state
  try {
    const raw = await redis.get(key);
    const state: ConversationState | null = raw ? JSON.parse(raw) : null;

    // Attach state helpers to the context
    (ctx as any).conversationState = state;

    (ctx as any).setConversationState = async (newState: Omit<ConversationState, 'updated_at'>) => {
      const stateWithTimestamp: ConversationState = {
        ...newState,
        updated_at: new Date().toISOString(),
      };
      await redis.set(key, JSON.stringify(stateWithTimestamp), 'EX', CONVERSATION_STATE_TTL);
      (ctx as any).conversationState = stateWithTimestamp;
    };

    (ctx as any).clearConversationState = async () => {
      await redis.del(key);
      (ctx as any).conversationState = null;
    };
  } catch (err) {
    logger.error({ err, userId }, 'Failed to load conversation state from Redis');
    // Continue without state — don't block the user
    (ctx as any).conversationState = null;
    (ctx as any).setConversationState = async () => {};
    (ctx as any).clearConversationState = async () => {};
  }

  return next();
};
