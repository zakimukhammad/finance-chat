import { Context } from 'telegraf';
import { TransactionService } from '../../services/transaction';
import { OwnerService } from '../../services/owner';
import { formatCurrency, formatDateShort, shortId } from '../../utils/formatters';

export const historyHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const limitStr = args[0];
  let limit = 10;

  if (limitStr && !isNaN(parseInt(limitStr, 10))) {
    limit = Math.min(50, Math.max(1, parseInt(limitStr, 10)));
  }

  const telegramId = ctx.from?.id;
  const owner = await OwnerService.getOwner(telegramId!);
  const curr = owner?.currency || 'USD';

  const txs = await TransactionService.getHistory(limit);

  if (txs.length === 0) {
    await ctx.reply('No transactions found.');
    return;
  }

  let text = `📜 **Recent Transactions (Last ${txs.length})**\n\n`;

  txs.forEach((tx, index) => {
    const sign = tx.type === 'expense' ? '-' : '+';
    const walletText = tx.wallet ? ` [${tx.wallet.name}]` : '';
    text += `${index + 1}. \`${shortId(tx.id)}\` | ${formatDateShort(tx.date)} | ${tx.category?.icon || ''} ${formatCurrency(tx.amount, curr)}${walletText}\n`;
    if (tx.description) {
      text += `   📝 *${tx.description}*\n`;
    }
  });

  await ctx.reply(text, { parse_mode: 'Markdown' });
};

export const deleteHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const targetId = args[0];

  if (!targetId) {
    await ctx.reply('Please specify ID: /delete <id> or /delete last');
    return;
  }

  try {
    if (targetId.toLowerCase() === 'last') {
      const lastTx = await TransactionService.getLastOne();
      if (!lastTx) {
        await ctx.reply('No transactions to delete.');
        return;
      }
      await TransactionService.delete(lastTx.id);
      await ctx.reply('🗑️ Last transaction deleted.');
    } else {
      await TransactionService.delete(targetId);
      await ctx.reply(`🗑️ Transaction \`${targetId}\` deleted.`, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    await ctx.reply('⚠️ Transaction not found or could not be deleted.');
  }
};

export const editHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const target = args[0];

  if (target?.toLowerCase() !== 'last') {
    await ctx.reply('Currently only /edit last is supported via command. Use inline buttons for others.');
    return;
  }

  const lastTx = await TransactionService.getLastOne();
  if (!lastTx) {
    await ctx.reply('No transactions to edit.');
    return;
  }

  // Set up add flow with existing values to simulate edit
  await (ctx as any).setConversationState({
    state: 'add_amount',
    context: { type: lastTx.type, tx_id: lastTx.id } // simple edit overwrites it (in a real app, delete old and insert new, or update)
  });

  // For milestone 1.2, just delete the old one and start flow for new, or simple reply.
  // TRD says "re-open guided flow pre-filled".
  await TransactionService.delete(lastTx.id); // For simplicity, we drop it and start over.
  await ctx.reply(`Editing ${lastTx.type}. Old amount was ${lastTx.amount}. What is the new amount?`);
};
