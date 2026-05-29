import { Context, Markup } from 'telegraf';
import { OwnerService } from '../../services/owner';
import { WalletService } from '../../services/wallet';
import { CurrencyService } from '../../services/currency';
import { CURRENCIES } from '../../utils/constants';
import { buildCurrencyKeyboard, buildTimezoneKeyboard, buildSettingsKeyboard } from '../../utils/keyboard';
import { getSupabase } from '../../db/client';
import { logger } from '../../utils/logger';
import currency from 'currency.js';

export const getSettingsText = async (owner: any): Promise<string> => {
  let walletName = 'None';
  if (owner.settings.default_wallet_id) {
    const wallet = await WalletService.getById(owner.settings.default_wallet_id);
    if (wallet) {
      walletName = `${wallet.icon} ${wallet.name}`;
    }
  }

  const daily = owner.settings.daily_digest ? 'On' : 'Off';
  const weekly = owner.settings.weekly_digest ? 'On' : 'Off';
  const budget = owner.settings.show_budget_in_summary ? 'On' : 'Off';
  const hour = `${owner.settings.digest_hour.toString().padStart(2, '0')}:00`;

  return `⚙️ *Settings*\n\n` +
    `• *Base Currency*: ${owner.currency}\n` +
    `• *Timezone*: ${owner.timezone}\n` +
    `• *Default Wallet*: ${walletName}\n` +
    `• *Daily Digest*: ${daily}\n` +
    `• *Weekly Digest*: ${weekly}\n` +
    `• *Digest Hour*: ${hour}\n` +
    `• *Show Budget in Summary*: ${budget}`;
};

export const buildSettingsWalletsKeyboard = (wallets: any[], defaultWalletId?: string | null) => {
  const rows = [];
  for (let i = 0; i < wallets.length; i += 2) {
    const chunk = wallets.slice(i, i + 2).map(w => {
      const isDefault = w.id === defaultWalletId;
      const label = `${w.icon} ${w.name}${isDefault ? ' (Default)' : ''}`;
      return Markup.button.callback(label, `setwallet_${w.id}`);
    });
    rows.push(chunk);
  }
  rows.push([Markup.button.callback('⏭️ None (Clear Default)', 'setwallet_none')]);
  rows.push([Markup.button.callback('🔙 Back to Settings', 'set_back')]);
  return Markup.inlineKeyboard(rows);
};

export const settingsHandler = async (ctx: Context) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) {
    await ctx.reply('Please run /start first to set up your account.');
    return;
  }

  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  if (args.length > 0) {
    if (args[0].toLowerCase() === 'timezone' && args[1]) {
      const tz = args[1].trim();
      try {
        await OwnerService.updateTimezone(telegramId, tz);
        await ctx.reply(`✅ Timezone successfully updated to *${tz}*.`, { parse_mode: 'Markdown' });
      } catch (err: any) {
        await ctx.reply(`⚠️ ${err.message}`);
      }
      return;
    }
  }

  const text = await getSettingsText(owner);
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...buildSettingsKeyboard()
  });
};

export const handleSettingsCallback = async (ctx: Context, action: string) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) return;

  if (action === 'back') {
    const text = await getSettingsText(owner);
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...buildSettingsKeyboard()
    });
    return;
  }

  if (action === 'toggle_daily') {
    const daily = !owner.settings.daily_digest;
    const updated = await OwnerService.updateSettings(telegramId, { daily_digest: daily });
    const text = await getSettingsText(updated);
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...buildSettingsKeyboard()
    });
    return;
  }

  if (action === 'toggle_weekly') {
    const weekly = !owner.settings.weekly_digest;
    const updated = await OwnerService.updateSettings(telegramId, { weekly_digest: weekly });
    const text = await getSettingsText(updated);
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...buildSettingsKeyboard()
    });
    return;
  }

  if (action === 'toggle_budget') {
    const budget = !owner.settings.show_budget_in_summary;
    const updated = await OwnerService.updateSettings(telegramId, { show_budget_in_summary: budget });
    const text = await getSettingsText(updated);
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...buildSettingsKeyboard()
    });
    return;
  }

  if (action === 'currency') {
    await ctx.editMessageText('To change your base currency, select from the options below or type `/currency <CODE>` (e.g. `/currency USD`):', {
      parse_mode: 'Markdown',
      ...buildCurrencyKeyboard()
    });
    return;
  }

  if (action === 'tz') {
    await ctx.editMessageText('To change your timezone, select from the options below or type `/settings timezone <tz>` (e.g. `/settings timezone Europe/Berlin`):', {
      parse_mode: 'Markdown',
      ...buildTimezoneKeyboard()
    });
    return;
  }

  if (action === 'defwallet') {
    const wallets = await WalletService.list();
    await ctx.editMessageText('Select a default wallet:', {
      ...buildSettingsWalletsKeyboard(wallets, owner.settings.default_wallet_id)
    });
    return;
  }

  if (action === 'digesthour') {
    await (ctx as any).setConversationState({
      state: 'settings_digesthour',
      context: { messageId: ctx.callbackQuery?.message?.message_id }
    });
    await ctx.reply('Please enter the digest hour (0-23) in your local timezone:');
    return;
  }
};

export const handleSettingsWalletCallback = async (ctx: Context, walletId: string) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const newDefaultId = walletId === 'none' ? null : walletId;
  const updated = await OwnerService.updateSettings(telegramId, { default_wallet_id: newDefaultId });

  const text = await getSettingsText(updated);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...buildSettingsKeyboard()
  });
};

export const handleTimezoneCallback = async (ctx: Context, tz: string) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  if (tz === 'OTHER') {
    await ctx.reply('Please type `/settings timezone <tz>` with your custom IANA timezone (e.g. `/settings timezone Europe/Paris`).', { parse_mode: 'Markdown' });
    return;
  }

  const updated = await OwnerService.updateTimezone(telegramId, tz);
  const text = await getSettingsText(updated);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...buildSettingsKeyboard()
  });
};

export const currencyHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const codeArg = args[0]?.trim().toUpperCase();

  if (!codeArg) {
    await ctx.reply(
      'To change your base currency, select from the options below or type `/currency <CODE>` (e.g., `/currency USD`):',
      {
        parse_mode: 'Markdown',
        ...buildCurrencyKeyboard()
      }
    );
    return;
  }

  await performCurrencyUpdate(ctx, codeArg);
};

export const handleCurrencyCallback = async (ctx: Context, code: string) => {
  if (code === 'OTHER') {
    await ctx.reply('Please type `/currency <CODE>` with your custom 3-letter currency code (e.g. `/currency SGD`).', { parse_mode: 'Markdown' });
    return;
  }
  await performCurrencyUpdate(ctx, code);
};

async function performCurrencyUpdate(ctx: Context, code: string) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const supported = CURRENCIES.find(c => c.code === code);
  if (!supported) {
    await ctx.reply(`Unsupported currency. Supported currencies: ${CURRENCIES.map(c => c.code).join(', ')}`);
    return;
  }

  await ctx.reply(`Updating rates and backfilling transactions to ${code}... Please wait.`);

  // Perform background backfill
  (async () => {
    try {
      // 1. Update owner currency in DB
      const { error: ownerError } = await getSupabase()
        .from('owner')
        .update({ currency: code })
        .eq('telegram_id', telegramId);

      if (ownerError) throw ownerError;

      // 2. Fetch and backfill transactions
      const { data: txs, error: txError } = await getSupabase()
        .from('transactions')
        .select('*');

      if (txError) throw txError;

      let count = 0;
      if (txs && txs.length > 0) {
        for (const tx of txs) {
          const rate = await CurrencyService.getRate(tx.currency, code);
          const amount_base = currency(tx.amount).multiply(rate).value;

          const { error: updateError } = await getSupabase()
            .from('transactions')
            .update({ amount_base })
            .eq('id', tx.id);

          if (updateError) {
            logger.error({ updateError, txId: tx.id }, 'Failed to backfill amount_base for transaction');
          } else {
            count++;
          }
        }
      }

      await ctx.reply(`✅ Base currency updated to ${code}. ${count} transactions successfully backfilled.`);
    } catch (err) {
      logger.error({ err }, 'Error during base currency update and backfill');
      await ctx.reply('⚠️ Failed to update base currency. Something went wrong during transaction backfill.');
    }
  })();
}
