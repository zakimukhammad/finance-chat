import { Context } from 'telegraf';
import { WalletService } from '../../services/wallet';
import { OwnerService } from '../../services/owner';
import { formatCurrency } from '../../utils/formatters';
import { getSupabase } from '../../db/client';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export const summaryHandler = async (ctx: Context) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  const curr = owner?.currency || 'USD';

  // 1. Get transaction totals for the current month
  const now = new Date();
  const start = format(startOfMonth(now), 'yyyy-MM-dd');
  const end = format(endOfMonth(now), 'yyyy-MM-dd');

  // Query transactions directly to sum income/expense
  const { data: txs, error } = await getSupabase()
    .from('transactions')
    .select('type, amount_base')
    .gte('date', start)
    .lte('date', end);

  let income = 0;
  let expense = 0;

  if (txs) {
    txs.forEach(tx => {
      if (tx.type === 'income') income += Number(tx.amount_base);
      if (tx.type === 'expense') expense += Number(tx.amount_base);
    });
  }

  const net = income - expense;

  let text = `📊 *Financial Summary (${format(now, 'MMMM yyyy')})*\n\n`;
  text += `💰 *Total Income*: ${formatCurrency(income, curr)}\n`;
  text += `💸 *Total Expenses*: ${formatCurrency(expense, curr)}\n`;
  text += `💵 *Net Cashflow*: ${formatCurrency(net, curr)}\n\n`;

  // 2. Wallet Balances Section (Milestone 1.5)
  text += `━━━ Wallet Balances ━━━\n`;
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
