import { Context } from 'telegraf';
import { WalletService } from '../../services/wallet';
import { BudgetService } from '../../services/budget';
import { OwnerService } from '../../services/owner';
import { formatCurrency, formatPercent, progressBar } from '../../utils/formatters';
import { getSupabase } from '../../db/client';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from 'date-fns';

export const summaryHandler = async (ctx: Context) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) {
    await ctx.reply('Please run /start first to set up your account.');
    return;
  }

  const curr = owner.currency || 'USD';

  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const periodArg = args[0]?.toLowerCase();

  let start: string;
  let end: string;
  let periodLabel: string;

  if (periodArg === 'today') {
    const today = format(new Date(), 'yyyy-MM-dd');
    start = today;
    end = today;
    periodLabel = `Today, ${format(new Date(), 'MMM d, yyyy')}`;
  } else if (periodArg === 'week') {
    const now = new Date();
    start = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    end = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    periodLabel = `Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), 'MMM d')} – ${format(endOfWeek(now, { weekStartsOn: 1 }), 'MMM d, yyyy')}`;
  } else if (periodArg && /^\d{4}-\d{2}$/.test(periodArg)) {
    // YYYY-MM format
    const [year, month] = periodArg.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    start = format(startOfMonth(d), 'yyyy-MM-dd');
    end = format(endOfMonth(d), 'yyyy-MM-dd');
    periodLabel = format(d, 'MMMM yyyy');
  } else {
    // Default: current month
    const now = new Date();
    start = format(startOfMonth(now), 'yyyy-MM-dd');
    end = format(endOfMonth(now), 'yyyy-MM-dd');
    periodLabel = format(now, 'MMMM yyyy');
  }

  // 1. Get transaction totals for the period
  const { data: txs, error } = await getSupabase()
    .from('transactions')
    .select('type, amount_base, category_id')
    .gte('date', start)
    .lte('date', end);

  let income = 0;
  let expense = 0;
  const categoryTotals: Record<string, number> = {};

  if (txs) {
    txs.forEach(tx => {
      if (tx.type === 'income') income += Number(tx.amount_base);
      if (tx.type === 'expense') {
        expense += Number(tx.amount_base);
        if (tx.category_id) {
          categoryTotals[tx.category_id] = (categoryTotals[tx.category_id] || 0) + Number(tx.amount_base);
        }
      }
    });
  }

  const net = income - expense;
  const netIcon = net >= 0 ? '📈' : '📉';

  let text = `📊 *${periodLabel} Summary*\n\n`;
  text += `💰 *Income*:   ${formatCurrency(income, curr)}\n`;
  text += `💸 *Expenses*: ${formatCurrency(expense, curr)}\n`;
  text += `${netIcon} *Net*:      ${formatCurrency(net, curr)}\n`;

  // 2. Budget Status Section (Milestone 1.4 — show if owner setting is on)
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

  // 3. Wallet Balances Section (Milestone 1.5)
  text += `\n━━━ Wallet Balances ━━━\n`;
  const wallets = await WalletService.list();

  if (wallets.length === 0) {
    text += `No wallets configured.\n`;
  } else {
    // Sort wallets by balance descending
    const sorted = [...wallets].sort((a, b) => Number(b.balance) - Number(a.balance));
    const top3 = sorted.slice(0, 3);

    top3.forEach(w => {
      text += `${w.icon} *${w.name}*: ${formatCurrency(Number(w.balance), w.currency)}\n`;
    });

    if (sorted.length > 3) {
      const netWorth = await WalletService.getTotalNetWorth(curr);
      text += `\n📊 *Total Net Worth*: ${formatCurrency(netWorth, curr)}\n`;
    }
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
};
