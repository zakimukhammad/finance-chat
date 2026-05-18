import { Context } from 'telegraf';
import { OwnerService } from '../../services/owner';
import { buildCurrencyKeyboard, buildTimezoneKeyboard } from '../../utils/keyboard';
import { logger } from '../../utils/logger';

export const startHandler = async (ctx: Context) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (owner) {
    await ctx.reply('You are already set up! Type /help to see available commands.');
    return;
  }

  // Start onboarding state
  await (ctx as any).setConversationState({
    state: 'onboarding_currency',
    context: {}
  });

  await ctx.reply(
    '👋 Welcome to your Personal Finance Bot!\n' +
    'I\'ll help you track every rupiah, dollar, or euro right here in Telegram.\n\n' +
    'First — what\'s your preferred currency?',
    buildCurrencyKeyboard()
  );
};

export const handleCurrencySelection = async (ctx: Context, currency: string) => {
  const state = (ctx as any).conversationState;
  if (state?.state !== 'onboarding_currency') {
    return; // Ignore if not in correct state
  }

  await (ctx as any).setConversationState({
    state: 'onboarding_timezone',
    context: { currency }
  });

  await ctx.editMessageText('Great! Now — what\'s your timezone?', buildTimezoneKeyboard());
};

export const handleTimezoneSelection = async (ctx: Context, timezone: string) => {
  const state = (ctx as any).conversationState;
  if (state?.state !== 'onboarding_timezone') {
    return;
  }

  const currency = state.context.currency;
  const telegramId = ctx.from?.id;
  
  if (telegramId && currency) {
    try {
      await OwnerService.upsertOwner(telegramId, currency, timezone);
      await (ctx as any).clearConversationState();

      await ctx.editMessageText(
        '✅ All set!\n\n' +
        '📌 Quick start:\n' +
        '• Type \'spent 50000 on lunch\' — log an expense\n' +
        '• Type \'earned 5000000 from salary\' — log income\n' +
        '• /summary — see this month\'s overview\n' +
        '• /help — see all commands\n\n' +
        'Your tracker is ready. Let\'s go! 🚀'
      );
    } catch (err) {
      logger.error({ err }, 'Failed to save owner onboarding');
      await ctx.reply('⚠️ Failed to save your settings. Please try /start again.');
    }
  }
};
