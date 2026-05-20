import { Context, Markup } from 'telegraf';
import { OwnerService } from '../../services/owner';
import { WalletService } from '../../services/wallet';
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
      
      await (ctx as any).setConversationState({
        state: 'onboarding_wallet_name',
        context: { currency, timezone }
      });

      const markup = Markup.inlineKeyboard([
        [Markup.button.callback('💵 Cash', 'onbwallet_cash'), Markup.button.callback('🏦 Bank Account', 'onbwallet_bank')],
        [Markup.button.callback('📱 E-Wallet', 'onbwallet_ewallet'), Markup.button.callback('✏️ Custom Name', 'onbwallet_custom')]
      ]);

      await ctx.editMessageText(
        'Great! Last step — let\'s add your first wallet.\n' +
        'What do you call your main account?',
        markup
      );
    } catch (err) {
      logger.error({ err }, 'Failed to save owner onboarding');
      await ctx.reply('⚠️ Failed to save your settings. Please try /start again.');
    }
  }
};

export const handleOnboardingWalletSelection = async (ctx: Context, data: string) => {
  const state = (ctx as any).conversationState;
  if (state?.state !== 'onboarding_wallet_name') {
    return;
  }

  if (data === 'custom') {
    state.state = 'onboarding_wallet_custom_name';
    await (ctx as any).setConversationState(state);
    await ctx.editMessageText('What is the name of your main account? (e.g. BCA, GoPay, My Wallet)');
  } else {
    let name = '';
    let icon = '';
    let type: any = 'other';
    
    if (data === 'cash') {
      name = 'Cash';
      icon = '💵';
      type = 'cash';
    } else if (data === 'bank') {
      name = 'Bank Account';
      icon = '🏦';
      type = 'bank';
    } else if (data === 'ewallet') {
      name = 'E-Wallet';
      icon = '📱';
      type = 'ewallet';
    }

    state.state = 'onboarding_wallet_balance';
    state.context.wallet_name = name;
    state.context.wallet_icon = icon;
    state.context.wallet_type = type;
    await (ctx as any).setConversationState(state);

    await ctx.editMessageText(`Starting balance for ${icon} ${name}? (Enter 0 if unknown)`);
  }
};

export const handleOnboardingText = async (ctx: Context, state: any, text: string): Promise<boolean> => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return false;

  if (state.state === 'onboarding_wallet_custom_name') {
    const name = text.trim();
    if (!name) {
      await ctx.reply('Please enter a valid wallet name.');
      return true;
    }
    state.state = 'onboarding_wallet_balance';
    state.context.wallet_name = name;
    state.context.wallet_icon = '💳';
    state.context.wallet_type = 'other';
    await (ctx as any).setConversationState(state);
    await ctx.reply(`Starting balance for 💳 ${name}? (Enter 0 if unknown)`);
    return true;
  }

  if (state.state === 'onboarding_wallet_balance') {
    const balance = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(balance)) {
      await ctx.reply('Please enter a valid number.');
      return true;
    }

    const { wallet_name, wallet_icon, wallet_type, currency } = state.context;
    
    try {
      // 1. Create the default wallet
      const wallet = await WalletService.create(
        wallet_name as string,
        wallet_icon as string,
        wallet_type as any,
        currency as string,
        balance,
        true // is_default = true
      );

      // 2. Set default wallet ID in owner settings
      await OwnerService.updateSettings(telegramId, { default_wallet_id: wallet.id });
      
      // 3. Clear conversation state
      await (ctx as any).clearConversationState();

      // 4. Send final welcome message
      await ctx.reply(
        `✅ All set! Wallet *${wallet_name}* created with default status.\n\n` +
        '📌 Quick start:\n' +
        '• Type \'spent 50000 on lunch\' — log an expense\n' +
        '• Type \'earned 5000000 from salary\' — log income\n' +
        '• /summary — see this month\'s overview\n' +
        '• /help — see all commands\n\n' +
        'Your tracker is ready. Let\'s go! 🚀',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error({ err }, 'Failed to complete onboarding wallet setup');
      await ctx.reply('⚠️ Failed to save your wallet settings. Please try again.');
    }
    return true;
  }

  return false;
};
