import { Telegraf, Context } from 'telegraf';
import { ownerGate } from './middleware/ownerGate';
import { conversationState } from './middleware/conversationState';
import { errorHandler } from './middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Create and configure the Telegraf bot instance.
 * Middleware chain order:
 *   1. Error Handler (outermost — catches everything)
 *   2. Owner Gate (drops non-owner messages)
 *   3. Conversation State (loads Redis state)
 *   4. Command handlers (registered below)
 */
export function createBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable');
  }

  const bot = new Telegraf(token);

  // ─── Middleware Chain ───────────────────────────────────────────────────
  bot.use(errorHandler);
  bot.use(ownerGate);
  bot.use(conversationState);

  // ─── Command Handlers ─────────────────────────────────────────────────
  // /ping — Smoke test command (Milestone 1.1)
  bot.command('ping', async (ctx) => {
    logger.info('Received /ping command');
    await ctx.reply('pong 🏓');
  });

  // /start — Placeholder for onboarding (Milestone 1.2)
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '👋 Welcome to your Personal Finance Bot!\n\n' +
      'I\'ll help you track every rupiah, dollar, or euro right here in Telegram.\n\n' +
      '📌 Quick start:\n' +
      '• Type "spent 50000 on lunch" — log an expense\n' +
      '• Type "earned 5000000 from salary" — log income\n' +
      '• /summary — see this month\'s overview\n' +
      '• /help — see all commands\n\n' +
      'Your tracker is ready. Let\'s go! 🚀'
    );
  });

  // /help — Show available commands
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📖 *Available Commands*\n\n' +
      '`/start`     — Set up your bot\n' +
      '`/help`      — Show this help message\n' +
      '`/ping`      — Check if bot is alive\n' +
      '`/add`       — Add a transaction\n' +
      '`/history`   — View recent transactions\n' +
      '`/summary`   — Monthly overview\n' +
      '`/budget`    — Manage budgets\n' +
      '`/goal`      — Savings goals\n' +
      '`/recurring` — Recurring entries\n' +
      '`/export`    — Export CSV/PDF\n' +
      '`/insights`  — AI spending analysis\n' +
      '`/categories`— Manage categories\n' +
      '`/currency`  — Change base currency\n' +
      '`/settings`  — View/edit preferences\n',
      { parse_mode: 'Markdown' }
    );
  });

  // ─── Global Error Handler ─────────────────────────────────────────────
  bot.catch((err, ctx) => {
    logger.error({ err, update_id: ctx.update?.update_id }, 'Telegraf global error');
  });

  logger.info('Bot instance created with middleware chain');
  return bot;
}
