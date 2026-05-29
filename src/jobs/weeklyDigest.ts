import { Telegraf } from 'telegraf';
import { getSupabase } from '../db/client';
import { toZonedTime, format } from 'date-fns-tz';
import { startOfWeek, endOfWeek } from 'date-fns';
import { formatCurrency, formatPercent, progressBar } from '../utils/formatters';
import { CategoryService } from '../services/category';
import { BudgetService } from '../services/budget';
import { WalletService } from '../services/wallet';
import { InsightService } from '../services/insight';
import { logger } from '../utils/logger';

export async function runWeeklyDigest(bot: Telegraf, owner: any): Promise<void> {
  if (!owner.settings.weekly_digest) {
    return;
  }

  const tz = owner.timezone || 'UTC';
  const localTime = toZonedTime(new Date(), tz);

  const start = format(startOfWeek(localTime, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const end = format(endOfWeek(localTime, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const periodLabel = `Week of ${format(startOfWeek(localTime, { weekStartsOn: 1 }), 'MMM d')} – ${format(endOfWeek(localTime, { weekStartsOn: 1 }), 'MMM d, yyyy')}`;

  const { data: txs, error } = await getSupabase()
    .from('transactions')
    .select('type, amount_base, category_id')
    .gte('date', start)
    .lte('date', end);

  if (error) {
    logger.error({ error }, 'Failed to fetch weekly transactions for weekly digest');
    return;
  }

  let income = 0;
  let expense = 0;
  const categoryTotals: Record<string, number> = {};

  if (txs) {
    for (const tx of txs) {
      if (tx.type === 'income') income += Number(tx.amount_base);
      if (tx.type === 'expense') {
        expense += Number(tx.amount_base);
        if (tx.category_id) {
          categoryTotals[tx.category_id] = (categoryTotals[tx.category_id] || 0) + Number(tx.amount_base);
        }
      }
    }
  }

  const net = income - expense;
  const netIcon = net >= 0 ? '📈' : '📉';
  const netPrefix = net > 0 ? '+' : '';
  const curr = owner.currency || 'USD';

  let text = `📊 *${periodLabel} Summary*\n\n`;
  text += `💰 *Income*:      ${formatCurrency(income, curr)}\n`;
  text += `💸 *Expenses*:    ${formatCurrency(expense, curr)}\n`;
  text += `${netIcon} *Net*:         ${netPrefix}${formatCurrency(net, curr)}\n`;

  // Top 5 Spending Categories
  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (sortedCategories.length > 0) {
    const allCategories = await CategoryService.getAll();
    const catMap = new Map(allCategories.map(c => [c.id, c]));

    text += `\n━━━ Top Spending ━━━\n`;
    for (const [catId, total] of sortedCategories) {
      const cat = catMap.get(catId);
      const icon = cat?.icon || '❓';
      const name = cat?.name || 'Unknown';
      const pct = expense > 0 ? (total / expense) * 100 : 0;
      text += `${icon} ${name}  ${formatCurrency(total, curr)} ${progressBar(pct)} ${formatPercent(pct)}\n`;
    }
  }

  // Budget Status Section
  if (owner.settings.show_budget_in_summary) {
    const statuses = await BudgetService.getStatus();
    if (statuses.length > 0) {
      text += `\n━━━ Budget Status ━━━\n`;
      for (const status of statuses) {
        const icon = status.pct_used >= 100 ? '🔴' : status.pct_used >= 80 ? '⚠️' : '✅';
        text += `${icon}  ${status.icon} ${status.category_name}: ${formatPercent(status.pct_used)}  (${formatCurrency(status.spent, curr)} / ${formatCurrency(status.budget_amount, curr)})\n`;
      }
    }
  }

  // Wallet Balances Section
  const wallets = await WalletService.list();
  if (wallets.length > 0) {
    text += `\n━━━ Wallet Balances ━━━\n`;
    const sorted = [...wallets].sort((a, b) => Number(b.balance) - Number(a.balance));
    const top3 = sorted.slice(0, 3);

    const walletParts = top3.map(w => `${w.icon} ${w.name}  ${formatCurrency(Number(w.balance), w.currency)}`);
    text += walletParts.join(' · ') + '\n';

    if (sorted.length > 3) {
      const netWorth = await WalletService.getTotalNetWorth(curr);
      text += `📊 *Net Worth*: ${formatCurrency(netWorth, curr)}\n`;
    }
  }

  // Prepend weekly insight digest if enabled
  let insightsText = '';
  try {
    insightsText = await InsightService.generate();
  } catch (err) {
    logger.warn({ err }, 'Failed to generate weekly AI insights for digest');
  }

  let finalMessage = '';
  if (insightsText) {
    finalMessage += `💡 *AI Insights:*\n${insightsText}\n\n`;
  }
  finalMessage += text;

  await bot.telegram.sendMessage(owner.telegram_id, finalMessage, { parse_mode: 'Markdown' });
  logger.info({ telegramId: owner.telegram_id }, 'Sent weekly digest successfully');
}
