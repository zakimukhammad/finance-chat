import { Context, MiddlewareFn } from 'telegraf';
import { logger } from '../../utils/logger';

/**
 * Owner Gate Middleware
 *
 * This is the FIRST middleware in the chain. Runs before everything.
 * Silently drops all messages not from OWNER_TELEGRAM_ID.
 * Does not reply, does not log to user-facing systems.
 */
export const ownerGate: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  const ownerId = parseInt(process.env.OWNER_TELEGRAM_ID!, 10);

  if (!userId || userId !== ownerId) {
    // Silently drop — do not reply, do not log to user-facing systems
    logger.debug({ userId, ownerId }, 'Owner gate: dropping message from non-owner');
    return;
  }

  return next();
};
