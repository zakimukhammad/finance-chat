import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { createBot } from './bot';
import { logger } from './utils/logger';
import { registerJobs } from './jobs/scheduler';

// ─── Initialize Sentry ─────────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  logger.info('Sentry initialized');
}

// ─── Track Start Time ──────────────────────────────────────────────────────
const startTime = Date.now();

// ─── Create Hono App ────────────────────────────────────────────────────────
const app = new Hono();

// ─── Create Bot ─────────────────────────────────────────────────────────────
const bot = createBot();

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check endpoint — used by Better Stack uptime monitor
app.get('/health', (c) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  return c.json({
    status: 'ok',
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
  });
});

// Telegram webhook endpoint
app.post('/webhook/telegram', async (c) => {
  // Validate webhook secret
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn('Webhook: invalid secret token');
    return c.text('Forbidden', 403);
  }

  try {
    const update = await c.req.json();
    await bot.handleUpdate(update);
    return c.text('OK');
  } catch (err) {
    logger.error({ err }, 'Webhook: failed to process update');
    Sentry.captureException(err);
    return c.text('Internal Server Error', 500);
  }
});

// ─── Start Server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

async function main(): Promise<void> {
  // If in development, use polling instead of webhook
  if (process.env.NODE_ENV === 'development' && !process.env.APP_URL) {
    logger.info('Development mode: starting bot with polling');
    bot.launch()
      .then(() => logger.info('Bot polling started'))
      .catch((err) => logger.error({ err }, 'Bot polling failed'));
  } else if (process.env.APP_URL) {
    // Production: set webhook
    const webhookUrl = `${process.env.APP_URL}/webhook/telegram`;
    try {
      await bot.telegram.setWebhook(webhookUrl, {
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      });
      logger.info({ webhookUrl }, 'Webhook registered with Telegram');
    } catch (err) {
      logger.error({ err }, 'Failed to register webhook');
    }
  }

  // Register scheduled cron jobs
  registerJobs(bot);

  // Start HTTP server
  serve({
    fetch: app.fetch,
    port: PORT,
  }, (info) => {
    logger.info({ port: info.port }, `🚀 FinanceBot server running on port ${info.port}`);
  });
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal');
  bot.stop(signal);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start ──────────────────────────────────────────────────────────────────
main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

// Export for testing
export { app, bot };
