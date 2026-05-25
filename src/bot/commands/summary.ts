import { Context } from 'telegraf';
import { WalletService } from '../../services/wallet';
import { BudgetService } from '../../services/budget';
import { OwnerService } from '../../services/owner';
import { CategoryService } from '../../services/category';
import { formatCurrency, formatPercent, progressBar } from '../../utils/formatters';
import { buildSummaryFooterKeyboard } from '../../utils/keyboard';
import { getSupabase } from '../../db/client';
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  subMonths,
  format,
} from 'date-fns';

// ─── Helper: fetch expense total for a date range ──────────────────────────

async function getExpenseTotalForRange(start: string, end: string): Promise<number> {
  const { data: txs } = await getSupabase()
    .from('transactions')
    .select('type, amount_base')
    .gte('date', start)
    .lte('date', end)
    .eq('type', 'expense');

  if (!txs || txs.length === 0) return 0;
  return txs.reduce((sum, tx) => sum + Number(tx.amount_base), 0);
}

// ─── Helper: compute prior period label & date range ───────────────────────

function getPriorMonthRange(refDate: Date): { start: string; end: string; label: string } {
  const prior = subMonths(refDate, 1);
  return {
    start: format(startOfMonth(prior), 'yyyy-MM-dd'),
    end: format(endOfMonth(prior), 'yyyy-MM-dd'),
    label: format(prior, 'MMMM'),
  };
}

// ─── Main Handler ──────────────────────────────────────────────────────────

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

  // ─── 1. Determine date range ────────────────────────────────────────────

  let start: string;
  let end: string;
  let periodLabel: string;
  let refDate: Date;             // the "anchor" date for the period (used for prior month calc)
  let isMonthPeriod = false;     // only show period comparison for month-level summaries

  if (periodArg === 'today') {
    refDate = new Date();
    const today = format(refDate, 'yyyy-MM-dd');
    start = today;
    end = today;
    periodLabel = `Today, ${format(refDate, 'MMM d, yyyy')}`;
  } else if (periodArg === 'week') {
    refDate = new Date();
    start = format(startOfWeek(refDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    end = format(endOfWeek(refDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    periodLabel = `Week of ${format(startOfWeek(refDate, { weekStartsOn: 1 }), 'MMM d')} – ${format(endOfWeek(refDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}`;
  } else if (periodArg && /^\d{4}-\d{2}$/.test(periodArg)) {
    // YYYY-MM format — specific historical month
    const [year, month] = periodArg.split('-').map(Number);
    refDate = new Date(year, month - 1, 1);
    start = format(startOfMonth(refDate), 'yyyy-MM-dd');
    end = format(endOfMonth(refDate), 'yyyy-MM-dd');
    periodLabel = format(refDate, 'MMMM yyyy');
    isMonthPeriod = true;
  } else {
    // Default: current month
    refDate = new Date();
    start = format(startOfMonth(refDate), 'yyyy-MM-dd');
    end = format(endOfMonth(refDate), 'yyyy-MM-dd');
    periodLabel = format(refDate, 'MMMM yyyy');
    isMonthPeriod = true;
  }

  // ─── 2. Fetch transactions for the period ───────────────────────────────

  const { data: txs } = await getSupabase()
    .from('transactions')
    .select('type, amount_base, category_id')
    .gte('date', start)
    .lte('date', end);

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

  // ─── 3. Build output text ───────────────────────────────────────────────

  let text = `📊 *${periodLabel} Summary*\n\n`;
  text += `💰 *Income*:      ${formatCurrency(income, curr)}\n`;
  text += `💸 *Expenses*:    ${formatCurrency(expense, curr)}\n`;
  text += `${netIcon} *Net*:         ${netPrefix}${formatCurrency(net, curr)}\n`;

  // ─── 4. Top 5 Spending Categories ───────────────────────────────────────

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (sortedCategories.length > 0) {
    // Fetch all categories once for efficient lookup
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

  // ─── 5. Budget Status Section ───────────────────────────────────────────

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

  // ─── 6. Wallet Balances Section ─────────────────────────────────────────

  const wallets = await WalletService.list();

  if (wallets.length > 0) {
    text += `\n━━━ Wallet Balances ━━━\n`;
    const sorted = [...wallets].sort((a, b) => Number(b.balance) - Number(a.balance));
    const top3 = sorted.slice(0, 3);

    // Compact inline format per TRD Section 9.7
    const walletParts = top3.map(w => `${w.icon} ${w.name}  ${formatCurrency(Number(w.balance), w.currency)}`);
    text += walletParts.join(' · ') + '\n';

    if (sorted.length > 3) {
      const netWorth = await WalletService.getTotalNetWorth(curr);
      text += `📊 *Net Worth*: ${formatCurrency(netWorth, curr)}\n`;
    }
  }

  // ─── 7. Period Comparison ───────────────────────────────────────────────

  if (isMonthPeriod && expense > 0) {
    const prior = getPriorMonthRange(refDate);
    const priorExpense = await getExpenseTotalForRange(prior.start, prior.end);

    if (priorExpense > 0) {
      const changePct = ((expense - priorExpense) / priorExpense) * 100;
      const arrow = changePct >= 0 ? '↑' : '↓';
      text += `\n${arrow} ${formatPercent(Math.abs(changePct))} vs ${prior.label}\n`;
    }
  }

  // ─── 8. Send with footer buttons ────────────────────────────────────────

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...buildSummaryFooterKeyboard(),
  });
};
