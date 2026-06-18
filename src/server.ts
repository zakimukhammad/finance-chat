import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as Sentry from '@sentry/node';
import { createBot } from './bot';
import { logger } from './utils/logger';
import { registerJobs } from './jobs/scheduler';
import { OwnerService } from './services/owner';
import { WalletService } from './services/wallet';
import { TransactionService } from './services/transaction';
import { BudgetService } from './services/budget';
import { GoalService } from './services/goal';

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

// Dashboard stats endpoint (Demo mode or Live mode with passcode validation)
app.get('/api/dashboard-stats', async (c) => {
  const passcodeHeader = c.req.header('X-Dashboard-Passcode');
  const validPasscode = process.env.DASHBOARD_PASSCODE || process.env.OWNER_TELEGRAM_ID || '123456';
  const isAuthorized = passcodeHeader === validPasscode;

  if (!isAuthorized) {
    // Return mock data for Demo Mode
    return c.json({
      mode: 'demo',
      currency: 'USD',
      stats: {
        netWorth: 12450.80,
        monthlyIncome: 4500.00,
        monthlyExpense: 2350.50,
        netSavings: 2149.50,
        wallets: [
          { id: '1', name: 'Main Bank Account', icon: '🏦', type: 'bank', currency: 'USD', balance: 8430.30 },
          { id: '2', name: 'Cash Wallet', icon: '💵', type: 'cash', currency: 'USD', balance: 520.50 },
          { id: '3', name: 'Investment Wallet', icon: '📈', type: 'investment', currency: 'USD', balance: 3500.00 }
        ],
        budgets: [
          { category_name: 'Food & Dining', icon: '🍔', budget_amount: 600, spent: 450.20, pct_used: 75 },
          { category_name: 'Transportation', icon: '🚗', budget_amount: 200, spent: 80.00, pct_used: 40 },
          { category_name: 'Entertainment', icon: '🎬', budget_amount: 300, spent: 320.00, pct_used: 107 },
          { category_name: 'Shopping', icon: '🛍️', budget_amount: 400, spent: 150.80, pct_used: 38 }
        ],
        savingsGoals: [
          { name: 'New Laptop', target_amount: 1500, current_amount: 900, status: 'active', deadline: '2026-09-01' },
          { name: 'Vacation Fund', target_amount: 3000, current_amount: 3000, status: 'completed', deadline: '2026-06-30' },
          { name: 'Emergency Savings', target_amount: 5000, current_amount: 2500, status: 'active', deadline: null }
        ],
        transactions: [
          { id: 't1', type: 'expense', amount: 45.20, currency: 'USD', amount_base: 45.20, description: 'Groceries at Walmart', date: new Date().toISOString().split('T')[0], category: { name: 'Food & Dining', icon: '🍔' } },
          { id: 't2', type: 'income', amount: 2200.00, currency: 'USD', amount_base: 2200.00, description: 'Monthly Salary Paycheck', date: new Date().toISOString().split('T')[0], category: { name: 'Salary', icon: '💼' } },
          { id: 't3', type: 'expense', amount: 15.00, currency: 'USD', amount_base: 15.00, description: 'Netflix Subscription', date: new Date(Date.now() - 86400000).toISOString().split('T')[0], category: { name: 'Entertainment', icon: '🎬' } },
          { id: 't4', type: 'expense', amount: 12.50, currency: 'USD', amount_base: 12.50, description: 'Uber ride', date: new Date(Date.now() - 172800000).toISOString().split('T')[0], category: { name: 'Transportation', icon: '🚗' } },
          { id: 't5', type: 'income', amount: 50.00, currency: 'USD', amount_base: 50.00, description: 'Freelance design review', date: new Date(Date.now() - 259200000).toISOString().split('T')[0], category: { name: 'Freelance', icon: '💻' } }
        ]
      }
    });
  }

  try {
    // Authorized: Fetch real database statistics
    const ownerIdStr = process.env.OWNER_TELEGRAM_ID;
    if (!ownerIdStr) {
      return c.json({ error: 'OWNER_TELEGRAM_ID not configured on server' }, 500);
    }
    const telegramId = parseInt(ownerIdStr, 10);
    const owner = await OwnerService.getOwner(telegramId);
    const currency = owner?.currency || 'USD';

    // Fetch details
    const wallets = await WalletService.list();
    const netWorth = await WalletService.getTotalNetWorth(currency);
    const summary = await TransactionService.getSummary('month');
    const budgets = await BudgetService.getStatus();
    const savingsGoals = await GoalService.list();
    const transactions = await TransactionService.getHistory(10);

    return c.json({
      mode: 'live',
      currency,
      stats: {
        netWorth,
        monthlyIncome: summary.total_income,
        monthlyExpense: summary.total_expense,
        netSavings: summary.net,
        wallets,
        budgets,
        savingsGoals,
        transactions
      }
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch dashboard stats');
    return c.json({ error: 'Failed to fetch live stats', details: err.message }, 500);
  }
});

// Chat NLP simulator endpoint
app.post('/api/chat-demo', async (c) => {
  try {
    const { text } = await c.req.json();
    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Text prompt is required' }, 400);
    }

    const ownerIdStr = process.env.OWNER_TELEGRAM_ID;
    let currency = 'USD';
    let timezone = 'UTC';

    if (ownerIdStr) {
      const telegramId = parseInt(ownerIdStr, 10);
      const owner = await OwnerService.getOwner(telegramId);
      if (owner) {
        currency = owner.currency;
        timezone = owner.timezone;
      }
    }

    const { NLPService } = await import('./services/nlp');
    const result = await NLPService.parse(text, currency, timezone);

    if (!result) {
      return c.json({
        success: false,
        message: "Maaf, saya tidak mengerti maksud pesan tersebut. Bisakah Anda mengulanginya dengan format lain? (Contoh: 'spent 50 on food' atau 'gaji 5000000')",
        parsed: null
      });
    }

    // Return a nice human-readable parsing confirmation
    let formattedMessage = '';
    if (result.intent === 'LOG_EXPENSE') {
      formattedMessage = `✅ *Tercatat Pengeluaran (Expense)*:\n💵 Jumlah: *${result.amount.toLocaleString()} ${result.currency}*\n🏷️ Kategori: *${result.category_hint || 'Umum'}*\n📝 Deskripsi: *${result.description || '-'}*\n📅 Tanggal: *${result.date}*`;
    } else if (result.intent === 'LOG_INCOME') {
      formattedMessage = `✅ *Tercatat Pemasukan (Income)*:\n💵 Jumlah: *${result.amount.toLocaleString()} ${result.currency}*\n🏷️ Kategori: *${result.category_hint || 'Gaji/Lain-lain'}*\n📝 Deskripsi: *${result.description || '-'}*\n📅 Tanggal: *${result.date}*`;
    } else if (result.intent === 'LOG_TRANSFER') {
      formattedMessage = `✅ *Tercatat Transfer*:\n💵 Jumlah: *${result.amount.toLocaleString()} ${result.currency}*\n📤 Dari: *${result.wallet_hint || '-'}*\n📥 Ke: *${result.to_wallet_hint || '-'}*\n📝 Deskripsi: *${result.description || '-'}*\n📅 Tanggal: *${result.date}*`;
    } else {
      formattedMessage = `❓ Pesan dipahami sebagai aksi lain, namun parameter tidak lengkap.`;
    }

    return c.json({
      success: true,
      message: formattedMessage,
      parsed: result
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to parse chat demo');
    return c.json({ error: 'Failed to process request', details: err.message }, 500);
  }
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

// Serve static assets from the public directory
app.use('/*', serveStatic({ root: './public' }));

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
if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });
}

// Export for testing
export { app, bot };
