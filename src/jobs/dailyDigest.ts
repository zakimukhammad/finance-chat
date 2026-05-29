import { Telegraf } from 'telegraf';
import { getSupabase } from '../db/client';
import { toZonedTime, format } from 'date-fns-tz';
import { formatCurrency } from '../utils/formatters';
import { logger } from '../utils/logger';

export async function runDailyDigest(bot: Telegraf, owner: any): Promise<void> {
  if (!owner.settings.daily_digest) {
    return;
  }

  const tz = owner.timezone || 'UTC';
  const localTime = toZonedTime(new Date(), tz);
  const todayStr = format(localTime, 'yyyy-MM-dd');

  const { data: txs, error } = await getSupabase()
    .from('transactions')
    .select('type, amount_base')
    .eq('date', todayStr);

  if (error) {
    logger.error({ error }, 'Failed to fetch today\'s transactions for daily digest');
    return;
  }

  let spent = 0;
  let earned = 0;

  if (txs) {
    for (const tx of txs) {
      if (tx.type === 'expense') {
        spent += Number(tx.amount_base);
      } else if (tx.type === 'income') {
        earned += Number(tx.amount_base);
      }
    }
  }

  const net = earned - spent;
  const curr = owner.currency || 'USD';

  const spentStr = formatCurrency(spent, curr);
  const earnedStr = formatCurrency(earned, curr);
  const netStr = formatCurrency(net, curr);

  const message = `📅 *Today:* Spent ${spentStr} – Earned ${earnedStr} – Net ${netStr}`;

  await bot.telegram.sendMessage(owner.telegram_id, message, { parse_mode: 'Markdown' });
  logger.info({ telegramId: owner.telegram_id }, 'Sent daily digest successfully');
}
