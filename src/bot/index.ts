import { Telegraf, Markup } from 'telegraf';
import { ownerGate } from './middleware/ownerGate';
import { rateLimiter } from './middleware/rateLimiter';
import { conversationState } from './middleware/conversationState';
import { startHandler, handleCurrencySelection, handleTimezoneSelection, handleOnboardingWalletSelection } from './commands/start';
import { helpHandler } from './commands/help';
import { addHandler, handleAddCallback } from './commands/add';
import { historyHandler, deleteHandler, editHandler } from './commands/history';
import { budgetHandler, handleBudgetCallback } from './commands/budget';
import { walletHandler, handleWalletCallback } from './commands/wallets';
import { summaryHandler } from './commands/summary';
import { goalHandler, handleGoalCallback } from './commands/goals';
import { recurringHandler, handleRecurringCallback } from './commands/recurring';
import { textMessageHandler, handleNlpCategoryCallback } from './handlers/textMessage';
import { settingsHandler, currencyHandler, handleSettingsCallback, handleSettingsWalletCallback, handleTimezoneCallback } from './commands/settings';
import { categoriesHandler, handleCategoryCallback } from './commands/categories';
import { exportHandler } from './commands/export';
import { insightsHandler, runInsights } from './commands/insights';
import { resetHandler, handleResetCallback } from './commands/reset';
import { errorHandler } from './middleware/errorHandler';
import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/formatters';
import { OwnerService } from '../services/owner';
import { CategoryService } from '../services/category';
import { BudgetService } from '../services/budget';

/**
 * Create and configure the Telegraf bot instance.
 * Middleware chain order:
 *   1. Error Handler (outermost — catches everything)
 *   2. Owner Gate (drops non-owner messages)
 *   3. Rate Limiter (soft-drops if > 10 msgs/min)
 *   4. Conversation State (loads Redis state)
 *   5. Command handlers (registered below)
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
  bot.use(rateLimiter);
  bot.use(conversationState);

  // ─── Commands ───────────────────────────────────────────────────────────
  bot.command('ping', async (ctx) => {
    logger.info('Received /ping command');
    await ctx.reply('pong 🏓');
  });

  bot.start(startHandler);
  bot.help(helpHandler);

  bot.command('add', addHandler);
  bot.command('history', historyHandler);
  bot.command('delete', deleteHandler);
  bot.command('edit', editHandler);
  bot.command('budget', budgetHandler);
  bot.command('wallet', walletHandler);
  bot.command('wallets', walletHandler);
  bot.command('reconcile', walletHandler);
  bot.command('summary', summaryHandler);
  bot.command('export', exportHandler);
  bot.command('insights', insightsHandler);
  bot.command('goal', goalHandler);
  bot.command('goals', goalHandler);
  bot.command('recurring', recurringHandler);
  bot.command('settings', settingsHandler);
  bot.command('currency', currencyHandler);
  bot.command('categories', categoriesHandler);
  bot.command('reset', resetHandler);

  // ─── Callbacks & Messages ───────────────────────────────────────────────
  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as any).data;
    if (!data) return;

    if (data.startsWith('currency_')) {
      const currencyCode = data.replace('currency_', '');
      const state = (ctx as any).conversationState;
      if (state?.state === 'onboarding_currency') {
        await handleCurrencySelection(ctx, currencyCode);
      } else {
        const { handleCurrencyCallback } = await import('./commands/settings');
        await handleCurrencyCallback(ctx, currencyCode);
      }
    } else if (data.startsWith('tz_')) {
      const state = (ctx as any).conversationState;
      if (state?.state === 'onboarding_timezone') {
        await handleTimezoneSelection(ctx, data.replace('tz_', ''));
      } else {
        await handleTimezoneCallback(ctx, data.replace('tz_', ''));
      }
    } else if (data.startsWith('set_')) {
      await handleSettingsCallback(ctx, data.replace('set_', ''));
    } else if (data.startsWith('setwallet_')) {
      await handleSettingsWalletCallback(ctx, data.replace('setwallet_', ''));
    } else if (data.startsWith('cattype_') || data.startsWith('catdelreq_') || data.startsWith('catdelconf_') || data === 'catdelcancel') {
      const action = data.startsWith('cattype_') ? 'cattype'
                    : data.startsWith('catdelreq_') ? 'catdelreq'
                    : data.startsWith('catdelconf_') ? 'catdelconf'
                    : 'catdelcancel';
      const val = data.replace(`${action}_`, '');
      await handleCategoryCallback(ctx, action, val);
    } else if (data.startsWith('onbwallet_')) {
      await handleOnboardingWalletSelection(ctx, data.replace('onbwallet_', ''));
    } else if (data.startsWith('cat_')) {
      const categoryId = data.replace('cat_', '');
      const state = (ctx as any).conversationState;
      if (state?.state === 'wallet_reconcile_category') {
        const { handleWalletCallback } = await import('./commands/wallets');
        await handleWalletCallback(ctx, 'cat', categoryId);
      } else {
        const handledNlp = await handleNlpCategoryCallback(ctx, categoryId);
        if (!handledNlp) {
          const handledBudget = await handleBudgetCallback(ctx, 'cat', categoryId);
          if (!handledBudget) {
            await handleAddCallback(ctx, 'cat', categoryId);
          }
        }
      }
    } else if (data.startsWith('date_')) {
      await handleAddCallback(ctx, 'date', data.replace('date_', ''));
    } else if (data.startsWith('confirm_')) {
      await handleAddCallback(ctx, 'confirm', data.replace('confirm_', ''));
    } else if (data.startsWith('undo_')) {
      await handleAddCallback(ctx, 'undo', data.replace('undo_', ''));
    } else if (data.startsWith('wallet_')) {
      await handleAddCallback(ctx, 'wallet', data.replace('wallet_', ''));
    } else if (data.startsWith('wicon_') || data.startsWith('wtype_') || data.startsWith('wdef_') || data.startsWith('wrec_')) {
      const action = data.split('_')[0];
      const val = data.replace(`${action}_`, '');
      const { handleWalletCallback } = await import('./commands/wallets');
      await handleWalletCallback(ctx, action, val);
    } else if (data.startsWith('goal_')) {
      await handleGoalCallback(ctx, data);
    } else if (
      data.startsWith('recfreq_') ||
      data.startsWith('rectype_') ||
      data.startsWith('recconfirm_') ||
      data.startsWith('recdate_') ||
      data.startsWith('recwallet_') ||
      data.startsWith('rectowallet_') ||
      data.startsWith('reccat_') ||
      data.startsWith('reccall_') ||
      data.startsWith('recdue_')
    ) {
      const action = data.split('_')[0];
      const val = data.replace(`${action}_`, '');
      await handleRecurringCallback(ctx, action, val);
    } else if (data.startsWith('summary_exportcsv')) {
      const yearMonth = data.replace('summary_exportcsv', '').replace(/^_/, '') || undefined;
      const { runExport } = await import('./commands/export');
      await runExport(ctx, 'csv', yearMonth);
    } else if (data.startsWith('summary_exportpdf')) {
      const yearMonth = data.replace('summary_exportpdf', '').replace(/^_/, '') || undefined;
      const { runExport } = await import('./commands/export');
      await runExport(ctx, 'pdf', yearMonth);
    } else if (data === 'summary_insights') {
      await runInsights(ctx);
    } else if (data.startsWith('insights_summary')) {
      const yearMonth = data.replace('insights_summary', '').replace(/^_/, '') || undefined;
      (ctx.state as any).periodArg = yearMonth;
      await summaryHandler(ctx);
    } else if (data === 'resetconfirm') {
      await handleResetCallback(ctx, 'confirm');
    } else if (data === 'resetcancel') {
      await handleResetCallback(ctx, 'cancel');
    } else if (data.startsWith('nudge_rec_yes:')) {
      const parts = data.split(':');
      const desc = decodeURIComponent(parts[1]);
      const amt = parseFloat(parts[2]);
      
      await (ctx as any).setConversationState({
        state: 'recurring_add_category',
        context: {
          description: desc,
          amount: amt,
          type: 'expense'
        }
      });
      
      const categories = await CategoryService.getByType('expense');
      const buttons = categories.map(cat => Markup.button.callback(`${cat.icon} ${cat.name}`, `reccat_${cat.id}`));
      const rows = [];
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
      }
      
      await ctx.reply('Silakan pilih kategori untuk transaksi rutin ini:', Markup.inlineKeyboard(rows));
    } else if (data.startsWith('nudge_budget_yes:')) {
      const parts = data.split(':');
      const categoryId = parts[1];
      const budgetAmount = parseFloat(parts[2]);
      
      await BudgetService.set(categoryId, budgetAmount);
      
      const category = await CategoryService.getById(categoryId);
      const owner = await OwnerService.getOwner(ctx.from?.id!);
      const formattedAmount = formatCurrency(budgetAmount, owner?.currency || 'IDR');
      
      await ctx.reply(`✅ Anggaran berhasil diatur! Batas bulanan untuk ${category ? `${category.icon} ${category.name}` : 'kategori ini'} adalah *${formattedAmount}*.`, { parse_mode: 'Markdown' });
    } else if (data === 'nudge_dismiss') {
      await ctx.deleteMessage().catch(() => {});
    }
    
    await ctx.answerCbQuery().catch(() => {});
  });


  bot.on('text', textMessageHandler);

  // ─── Global Error Handler ───────────────────────────────────────────────
  bot.catch((err, ctx) => {
    logger.error({ err, update_id: ctx.update?.update_id }, 'Telegraf global error');
  });

  logger.info('Bot instance created with middleware chain and commands');
  return bot;
}
