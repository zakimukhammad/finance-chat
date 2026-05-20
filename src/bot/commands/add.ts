import { Context, Markup } from 'telegraf';
import { CategoryService } from '../../services/category';
import { TransactionService } from '../../services/transaction';
import { OwnerService } from '../../services/owner';
import { BudgetService } from '../../services/budget';
import { WalletService } from '../../services/wallet';
import { buildCategoriesKeyboard, buildDateKeyboard, buildConfirmationKeyboard, buildWalletsKeyboard } from '../../utils/keyboard';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { formatISO, subDays } from 'date-fns';

export const addHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const type = args[0]?.toLowerCase();

  if (type !== 'expense' && type !== 'income' && type !== 'transfer') {
    await ctx.reply('Please specify: /add expense, /add income, or /add transfer');
    return;
  }

  await (ctx as any).setConversationState({
    state: 'add_amount',
    context: { type }
  });

  await ctx.reply(`Adding new ${type}. What is the amount? (e.g. 50000)`);
};

export const handleAddFlow = async (ctx: Context, state: any, text: string) => {
  const { state: currentState, context } = state;

  if (currentState === 'add_amount') {
    const amount = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('Please enter a valid positive number.');
      return;
    }

    if (context.type === 'transfer') {
      const wallets = await WalletService.list();
      const telegramId = ctx.from?.id;
      const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
      const defaultWalletId = owner?.settings?.default_wallet_id || null;
      await (ctx as any).setConversationState({
        state: 'add_from_wallet',
        context: { ...context, amount }
      });
      await ctx.reply('Select FROM wallet:', buildWalletsKeyboard(wallets, defaultWalletId));
    } else {
      const categories = await CategoryService.getByType(context.type);
      await (ctx as any).setConversationState({
        state: 'add_category',
        context: { ...context, amount }
      });
      await ctx.reply('Select category:', buildCategoriesKeyboard(categories, context.type));
    }
  } else if (currentState === 'add_description') {
    const description = text.toLowerCase() === 'skip' ? null : text;
    
    await (ctx as any).setConversationState({
      state: 'add_confirm',
      context: { ...context, description }
    });

    await showConfirmationCard(ctx, { ...context, description });
  }
};

export const handleAddCallback = async (ctx: Context, action: string, data: string) => {
  const state = (ctx as any).conversationState;
  if (!state) return;

  const { state: currentState, context } = state;

  if (currentState === 'add_category' && action === 'cat') {
    const category = await CategoryService.getById(data);
    if (!category) return;

    const wallets = await WalletService.list();
    const telegramId = ctx.from?.id;
    const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
    const defaultWalletId = owner?.settings?.default_wallet_id || null;

    if (wallets.length === 1) {
      // Auto-select if only 1 wallet exists
      await (ctx as any).setConversationState({
        state: 'add_date',
        context: { ...context, category_id: category.id, category_name: category.name, category_icon: category.icon, wallet_id: wallets[0].id, wallet_name: wallets[0].name, wallet_icon: wallets[0].icon }
      });
      await ctx.editMessageText('Select date:', buildDateKeyboard());
    } else if (wallets.length > 1) {
      const defaultWallet = wallets.find(w => w.id === defaultWalletId);
      await (ctx as any).setConversationState({
        state: 'add_wallet',
        context: {
          ...context,
          category_id: category.id,
          category_name: category.name,
          category_icon: category.icon,
          ...(defaultWallet ? {
            wallet_id: defaultWallet.id,
            wallet_name: defaultWallet.name,
            wallet_icon: defaultWallet.icon
          } : {})
        }
      });
      await ctx.editMessageText('Which wallet?', buildWalletsKeyboard(wallets, defaultWalletId));
    } else {
      // No wallets exist, skip
      await (ctx as any).setConversationState({
        state: 'add_date',
        context: { ...context, category_id: category.id, category_name: category.name, category_icon: category.icon }
      });
      await ctx.editMessageText('Select date:', buildDateKeyboard());
    }
  } else if (currentState === 'add_wallet' && action === 'wallet') {
    if (data === 'skip') {
      await (ctx as any).setConversationState({
        state: 'add_date',
        context: {
          ...context,
          wallet_id: undefined,
          wallet_name: undefined,
          wallet_icon: undefined
        }
      });
    } else {
      const wallets = await WalletService.list();
      const wallet = wallets.find(w => w.id === data);
      if (wallet) {
        await (ctx as any).setConversationState({
          state: 'add_date',
          context: { ...context, wallet_id: wallet.id, wallet_name: wallet.name, wallet_icon: wallet.icon }
        });
      }
    }
    await ctx.editMessageText('Select date:', buildDateKeyboard());
  } else if (currentState === 'add_from_wallet' && action === 'wallet') {
    if (data === 'skip') return; // Cannot skip from wallet in transfer
    
    const wallets = await WalletService.list();
    const wallet = wallets.find(w => w.id === data);
    if (!wallet) return;

    await (ctx as any).setConversationState({
      state: 'add_to_wallet',
      context: { ...context, wallet_id: wallet.id, wallet_name: wallet.name, wallet_icon: wallet.icon }
    });

    const otherWallets = wallets.filter(w => w.id !== wallet.id);
    await ctx.editMessageText('Select TO wallet:', buildWalletsKeyboard(otherWallets));
  } else if (currentState === 'add_to_wallet' && action === 'wallet') {
    if (data === 'skip') return;
    
    const wallets = await WalletService.list();
    const wallet = wallets.find(w => w.id === data);
    if (!wallet) return;

    await (ctx as any).setConversationState({
      state: 'add_date',
      context: { ...context, to_wallet_id: wallet.id, to_wallet_name: wallet.name, to_wallet_icon: wallet.icon }
    });
    
    await ctx.editMessageText('Select date:', buildDateKeyboard());
  } else if (currentState === 'add_date' && action === 'date') {
    let dateStr = '';
    if (data === 'today') {
      dateStr = formatISO(new Date(), { representation: 'date' });
    } else if (data === 'yesterday') {
      dateStr = formatISO(subDays(new Date(), 1), { representation: 'date' });
    }

    await (ctx as any).setConversationState({
      state: 'add_description',
      context: { ...context, date: dateStr }
    });

    await ctx.editMessageText('Enter a description, or type "skip":');
  } else if (currentState === 'add_confirm' && action === 'confirm') {
    if (data === 'cancel') {
      await (ctx as any).clearConversationState();
      await ctx.editMessageText('❌ Transaction cancelled.');
    } else if (data === 'edit') {
      // Re-open guided flow, simple reset for now
      await (ctx as any).setConversationState({
        state: 'add_amount',
        context: { type: context.type }
      });
      await ctx.editMessageText(`Editing ${context.type}. What is the new amount?`);
    } else if (data === 'save') {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      const owner = await OwnerService.getOwner(telegramId);
      if (!owner) return;

      const tx = await TransactionService.create({
        type: context.type,
        amount: context.amount,
        currency: owner.currency,
        wallet_id: context.wallet_id || null,
        to_wallet_id: context.to_wallet_id || null,
        category_id: context.category_id || null, // null for transfers
        description: context.description,
        date: context.date,
        source: 'manual'
      });

      await (ctx as any).clearConversationState();

      let balanceInfo = '';
      if (context.type === 'transfer' && context.wallet_id && context.to_wallet_id) {
        const wallets = await WalletService.list();
        const fromW = wallets.find(w => w.id === context.wallet_id);
        const toW = wallets.find(w => w.id === context.to_wallet_id);
        if (fromW && toW) {
          balanceInfo = `\n\n💳 Balances:\n• ${fromW.icon} ${fromW.name}: ${formatCurrency(fromW.balance, fromW.currency)}\n• ${toW.icon} ${toW.name}: ${formatCurrency(toW.balance, toW.currency)}`;
        }
      } else if (context.wallet_id) {
        const wallets = await WalletService.list();
        const w = wallets.find(w => w.id === context.wallet_id);
        if (w) {
          balanceInfo = `\n\n💳 Balance:\n• ${w.icon} ${w.name}: ${formatCurrency(w.balance, w.currency)}`;
        }
      }

      await ctx.editMessageText(`Saved! 📊${balanceInfo}\n\nTransaction ID: \`${tx.id.split('-')[0]}\``, {
        parse_mode: 'Markdown',
        reply_markup: buildConfirmationKeyboard(tx.id).reply_markup
      });
    }
  } else if (action === 'undo') {
    // Handle undo outside of normal state flow since it happens after save
    try {
      await TransactionService.delete(data);
      await ctx.editMessageText('↩️ Transaction deleted (Undone).');
    } catch (err) {
      await ctx.reply('⚠️ Failed to undo or transaction not found.');
    }
  }
};

const showConfirmationCard = async (ctx: Context, context: any) => {
  const telegramId = ctx.from?.id;
  const owner = await OwnerService.getOwner(telegramId!);
  const curr = owner?.currency || 'USD';
  
  let budgetStr = '';
  if (context.type === 'expense' && context.category_id) {
    budgetStr = await BudgetService.formatInlineStatus(context.category_id, curr);
  }

  let walletStr = '';
  if (context.type === 'transfer') {
    walletStr = `💳 **From**: ${context.wallet_icon} ${context.wallet_name} ➡️ **To**: ${context.to_wallet_icon} ${context.to_wallet_name}\n`;
  } else if (context.wallet_id) {
    walletStr = `💳 **Wallet**: ${context.wallet_icon} ${context.wallet_name}\n`;
  }

  const categoryStr = context.category_id ? `📁 **Category**: ${context.category_icon} ${context.category_name}\n` : '';

  const text = `Please confirm details:\n\n` +
    `💰 **Amount**: ${formatCurrency(context.amount, curr)}\n` +
    categoryStr +
    walletStr +
    `📅 **Date**: ${formatDate(context.date)}\n` +
    `📝 **Description**: ${context.description || '-'}\n` + budgetStr;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: buildConfirmationKeyboard().reply_markup
  });
};
