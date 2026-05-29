import { Context, Markup } from 'telegraf';
import { OwnerService } from '../../services/owner';
import { ResetService } from '../../services/resetService';
import { logger } from '../../utils/logger';

export const resetHandler = async (ctx: Context) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) {
    await ctx.reply('Please run /start first to set up your account.');
    return;
  }

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⚠️ Yes, Reset Everything', 'resetconfirm'),
      Markup.button.callback('❌ No, Cancel', 'resetcancel'),
    ],
  ]);

  await ctx.reply(
    `⚠️ *WARNING: Permanent Data Reset*\n\n` +
      `Are you sure you want to reset all your data? This will permanently delete:\n` +
      `• All transactions and histories\n` +
      `• All budgets and category caps\n` +
      `• All financial goals and milestones\n` +
      `• All recurring transaction templates\n` +
      `• All custom wallets and balances\n` +
      `• Your base currency and timezone settings\n\n` +
      `*This action CANNOT be undone.*`,
    {
      parse_mode: 'Markdown',
      ...keyboard,
    }
  );
};

export const handleResetCallback = async (ctx: Context, action: string) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  if (action === 'cancel') {
    await ctx.editMessageText(
      `❌ *Reset Cancelled*\n\nYour data has not been modified and remains completely safe.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (action === 'confirm') {
    try {
      // 1. Wipe database tables
      await ResetService.resetAllData(telegramId);

      // 2. Clear conversation state
      if ((ctx as any).clearConversationState) {
        await (ctx as any).clearConversationState();
      }

      await ctx.editMessageText(
        `🗑️ *All Data Successfully Reset!*\n\n` +
          `Your entire account history, budgets, goals, recurring jobs, and wallets have been completely wiped.\n\n` +
          `Please send /start to set up your new account from scratch.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error({ err, telegramId }, 'Failed to reset all data');
      await ctx.editMessageText(
        `⚠️ *Failed to reset your data.*\n\n` +
          `An unexpected error occurred on our end. Please try again or contact support if the issue persists.`,
        { parse_mode: 'Markdown' }
      );
    }
  }
};
