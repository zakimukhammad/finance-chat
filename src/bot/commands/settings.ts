import { Context } from 'telegraf';
import { OwnerService } from '../../services/owner';
import { CurrencyService } from '../../services/currency';
import { CURRENCIES } from '../../utils/constants';
import { buildCurrencyKeyboard } from '../../utils/keyboard';
import { getSupabase } from '../../db/client';
import { logger } from '../../utils/logger';
import currency from 'currency.js';

export const settingsHandler = async (ctx: Context) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) {
    await ctx.reply('Please run /start first to set up your account.');
    return;
  }

  const text = `⚙️ *Settings*\n\n` +
    `• *Base Currency*: ${owner.currency}\n` +
    `• *Timezone*: ${owner.timezone}\n\n` +
    `To change your base currency, type /currency <CODE> or select below:`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...buildCurrencyKeyboard()
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
