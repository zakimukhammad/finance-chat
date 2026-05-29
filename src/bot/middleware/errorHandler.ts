import { Context, MiddlewareFn } from 'telegraf';
import * as Sentry from '@sentry/node';
import { logger } from '../../utils/logger';

/**
 * Error Handler Middleware
 *
 * Catches all errors from downstream middleware/handlers.
 * Logs to Sentry and sends a friendly reply to the user.
 * Never exposes stack traces or raw error messages.
 */
export const errorHandler: MiddlewareFn<Context> = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    let error: Error;
    if (err instanceof Error) {
      error = err;
    } else if (typeof err === 'object' && err !== null) {
      const msg = (err as any).message || (err as any).details || JSON.stringify(err);
      error = new Error(msg);
      // Transfer useful properties if they exist
      if ((err as any).code) (error as any).code = (err as any).code;
      if ((err as any).details) (error as any).details = (err as any).details;
    } else {
      error = new Error(String(err));
    }

    // Log to structured logger
    logger.error({
      err: error,
      update_id: ctx.update?.update_id,
      from: ctx.from?.id,
      message: (ctx.message as any)?.text?.substring(0, 100),
    }, 'Unhandled error in bot handler');

    // Report to Sentry
    Sentry.captureException(error, {
      extra: {
        update_id: ctx.update?.update_id,
        from_id: ctx.from?.id,
      },
    });

    // Send friendly reply to user
    try {
      await ctx.reply('⚠️ Something went wrong. Please try again.');
    } catch (replyErr) {
      logger.error({ err: replyErr }, 'Failed to send error reply to user');
    }
  }
};
