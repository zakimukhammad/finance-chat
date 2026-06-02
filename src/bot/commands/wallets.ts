import { Context, Markup } from 'telegraf';
import { WalletService } from '../../services/wallet';
import { OwnerService } from '../../services/owner';
import { CategoryService } from '../../services/category';
import { formatCurrency } from '../../utils/formatters';
import { buildCategoriesKeyboard } from '../../utils/keyboard';

export const walletHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  let args = message.split(' ').slice(1);
  if (message.toLowerCase().startsWith('/reconcile')) {
    args = ['reconcile', ...args];
  }
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === 'balance') {
    await handleWalletBalance(ctx);
  } else if (subCommand === 'add') {
    if (args.length > 1) {
      // Direct add: /wallet add <name> <icon> <balance>
      const name = args[1];
      const icon = args[2] || '💳';
      const balance = parseFloat(args[3] || '0');
      const owner = await OwnerService.getOwner(ctx.from?.id!);
      await WalletService.create(name, icon, 'other', owner?.currency || 'IDR', balance, false);
      await ctx.reply(`✅ Wallet '${name}' added! Balance: ${formatCurrency(balance, owner?.currency || 'IDR')}`);
    } else {
      // Interactive add
      await (ctx as any).setConversationState({
        state: 'wallet_add_name',
        context: {}
      });
      await ctx.reply('What is the name of your new wallet/account? (e.g. BCA, GoPay, Cash)');
    }
  } else if (subCommand === 'delete') {
    const name = args.slice(1).join(' ').trim();
    if (!name) {
      await ctx.reply('Usage: /wallet delete <name>');
      return;
    }
    const wallet = await WalletService.getByName(name);
    if (!wallet) {
      await ctx.reply(`Wallet '${name}' not found.`);
      return;
    }
    try {
      await WalletService.delete(wallet.id);
      await ctx.reply(`✅ Wallet '${wallet.name}' deleted.`);
    } catch (err: any) {
      await ctx.reply(`❌ ${err.message}`);
    }
  } else if (subCommand === 'reconcile' || subCommand === 'checkup') {
    // Interactive reconcile flow
    const walletName = args.slice(1, -1).join(' ').trim();
    const amountStr = args[args.length - 1];
    const amount = args.length > 2 ? parseFloat(amountStr.replace(/,/g, '').replace(/[kK]$/, '000')) : NaN;

    if (walletName && !isNaN(amount)) {
      // Direct: /wallet reconcile <name> <amount>
      const wallet = await WalletService.getByName(walletName);
      if (!wallet) {
        await ctx.reply(`Wallet '${walletName}' not found.`);
        return;
      }
      // Prompt for category
      const allCats = await CategoryService.getAll();
      await (ctx as any).setConversationState({
        state: 'wallet_reconcile_category',
        context: {
          wallet_id: wallet.id,
          wallet_name: wallet.name,
          wallet_icon: wallet.icon,
          wallet_currency: wallet.currency,
          real_balance: amount
        }
      });
      await ctx.reply(
        `Reconciling *${wallet.icon} ${wallet.name}* to *${formatCurrency(amount, wallet.currency)}*\n\nWhich category should the adjustment be logged under?`,
        { parse_mode: 'Markdown', ...buildCategoriesKeyboard(allCats, 'both') }
      );
    } else {
      // Interactive: show wallet selection
      const wallets = await WalletService.list();
      if (wallets.length === 0) {
        await ctx.reply('No wallets found. Use /wallet add to create one.');
        return;
      }
      const rows = [];
      for (let i = 0; i < wallets.length; i += 2) {
        const chunk = wallets.slice(i, i + 2).map(w =>
          Markup.button.callback(`${w.icon} ${w.name}`, `wrec_${w.id}`)
        );
        rows.push(chunk);
      }
      await (ctx as any).setConversationState({
        state: 'wallet_reconcile_select',
        context: {}
      });
      await ctx.reply('🔄 *Wallet Reconciliation*\n\nWhich wallet do you want to reconcile?', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(rows)
      });
    }
  } else if (subCommand === 'rename') {
    const oldName = args[1];
    const newName = args.slice(2).join(' ').trim();
    if (!oldName || !newName) {
      await ctx.reply('Usage: /wallet rename <old_name> <new_name>');
      return;
    }
    const wallet = await WalletService.getByName(oldName);
    if (!wallet) {
      await ctx.reply(`Wallet '${oldName}' not found.`);
      return;
    }
    await WalletService.rename(wallet.id, newName);
    await ctx.reply(`✅ Wallet renamed from '${wallet.name}' to '${newName}'.`);
  } else {
    await ctx.reply('Unknown wallet command. Use: /wallet balance, /wallet add, /wallet delete, /wallet rename, /wallet reconcile <name> <balance>');
  }
};

export const handleWalletBalance = async (ctx: Context) => {
  const owner = await OwnerService.getOwner(ctx.from?.id!);
  const wallets = await WalletService.list();

  if (wallets.length === 0) {
    await ctx.reply('No wallets found. Use /wallet add to create one.');
    return;
  }

  let text = `💳 *Wallet Balances*\n\n`;
  let total = 0;

  for (const w of wallets) {
    text += `${w.icon} *${w.name}*: ${formatCurrency(Number(w.balance), w.currency)}${w.is_default ? ' (Default)' : ''}\n`;
    total += Number(w.balance); // Simplification: assuming same currency
  }

  text += `\n📊 *Net Worth*: ${formatCurrency(total, owner?.currency || 'IDR')}`;

  await ctx.reply(text, { parse_mode: 'Markdown' });
};

// Flow handlers for interactive add
export const handleWalletAddFlow = async (ctx: Context, state: any, text: string) => {
  if (state.state === 'wallet_add_name') {
    state.context.name = text;
    state.state = 'wallet_add_icon';
    await (ctx as any).setConversationState(state);
    
    const markup = Markup.inlineKeyboard([
      [Markup.button.callback('🏦 Bank', 'wicon_🏦'), Markup.button.callback('💵 Cash', 'wicon_💵')],
      [Markup.button.callback('📱 E-Wallet', 'wicon_📱'), Markup.button.callback('💳 Credit', 'wicon_💳')],
      [Markup.button.callback('✏️ Custom', 'wicon_custom')]
    ]);
    await ctx.reply('Choose an icon:', markup);
    return true;
  }
  
  if (state.state === 'wallet_add_icon_custom') {
    state.context.icon = text.trim() || '💳';
    state.state = 'wallet_add_type';
    await (ctx as any).setConversationState(state);
    
    const markup = Markup.inlineKeyboard([
      [Markup.button.callback('Bank', 'wtype_bank'), Markup.button.callback('Cash', 'wtype_cash')],
      [Markup.button.callback('E-Wallet', 'wtype_ewallet'), Markup.button.callback('Credit', 'wtype_credit')],
      [Markup.button.callback('Investment', 'wtype_investment'), Markup.button.callback('Other', 'wtype_other')]
    ]);
    await ctx.reply('What type of account is this?', markup);
    return true;
  }

  if (state.state === 'wallet_add_balance') {
    const bal = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(bal)) {
      await ctx.reply('Please enter a valid number.');
      return true;
    }
    state.context.balance = bal;
    state.state = 'wallet_add_default';
    await (ctx as any).setConversationState(state);
    
    const markup = Markup.inlineKeyboard([
      [Markup.button.callback('Yes, make default', 'wdef_yes')],
      [Markup.button.callback('No', 'wdef_no')]
    ]);
    await ctx.reply('Set this as your default wallet?', markup);
    return true;
  }
  return false;
};

// Flow handlers for interactive reconcile
export const handleWalletReconcileFlow = async (ctx: Context, state: any, text: string) => {
  if (state.state === 'wallet_reconcile_amount') {
    const bal = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(bal)) {
      await ctx.reply('⚠️ Please enter a valid number for the real balance.');
      return true;
    }
    state.context.real_balance = bal;
    state.state = 'wallet_reconcile_category';
    await (ctx as any).setConversationState(state);

    const allCats = await CategoryService.getAll();
    await ctx.reply(
      `Reconciling *${state.context.wallet_icon} ${state.context.wallet_name}* to *${formatCurrency(bal, state.context.wallet_currency || 'IDR')}*\n\nWhich category should the adjustment be logged under?`,
      { parse_mode: 'Markdown', ...buildCategoriesKeyboard(allCats, 'both') }
    );
    return true;
  }
  return false;
};

export const handleWalletCallback = async (ctx: Context, action: string, data: string) => {
  const state = (ctx as any).conversationState;
  if (!state) return false;

  if (action === 'wicon' && state.state === 'wallet_add_icon') {
    if (data === 'custom') {
      state.state = 'wallet_add_icon_custom';
      await (ctx as any).setConversationState(state);
      await ctx.reply('Send me an emoji or text for the icon:');
    } else {
      state.context.icon = data;
      state.state = 'wallet_add_type';
      await (ctx as any).setConversationState(state);
      
      const markup = Markup.inlineKeyboard([
        [Markup.button.callback('Bank', 'wtype_bank'), Markup.button.callback('Cash', 'wtype_cash')],
        [Markup.button.callback('E-Wallet', 'wtype_ewallet'), Markup.button.callback('Credit', 'wtype_credit')],
        [Markup.button.callback('Investment', 'wtype_investment'), Markup.button.callback('Other', 'wtype_other')]
      ]);
      await ctx.editMessageText('What type of account is this?', markup);
    }
    return true;
  }

  if (action === 'wtype' && state.state === 'wallet_add_type') {
    state.context.type = data;
    state.state = 'wallet_add_balance';
    await (ctx as any).setConversationState(state);
    await ctx.editMessageText('What is the current starting balance? (Enter 0 if unknown)');
    return true;
  }

  if (action === 'wdef' && state.state === 'wallet_add_default') {
    const isDefault = data === 'yes';
    const owner = await OwnerService.getOwner(ctx.from?.id!);
    const { name, icon, type, balance } = state.context;
    
    await WalletService.create(name, icon, type, owner?.currency || 'IDR', balance, isDefault);
    await (ctx as any).clearConversationState();
    
    await ctx.editMessageText(`✅ Wallet '${name}' added! Balance: ${formatCurrency(balance, owner?.currency || 'IDR')}`);
    return true;
  }

  if (action === 'wrec' && state.state === 'wallet_reconcile_select') {
    const wallet = await WalletService.getById(data);
    if (!wallet) {
      await ctx.reply('Wallet not found.');
      return true;
    }
    state.context.wallet_id = wallet.id;
    state.context.wallet_name = wallet.name;
    state.context.wallet_icon = wallet.icon;
    state.context.wallet_currency = wallet.currency;
    state.state = 'wallet_reconcile_amount';
    await (ctx as any).setConversationState(state);
    
    await ctx.editMessageText(`What is the real-world balance for *${wallet.icon} ${wallet.name}*? (What did you physically count?)`, { parse_mode: 'Markdown' });
    return true;
  }

  if (action === 'cat' && state.state === 'wallet_reconcile_category') {
    const { wallet_id, wallet_name, wallet_icon, wallet_currency, real_balance } = state.context;
    const owner = await OwnerService.getOwner(ctx.from?.id!);
    const category = await CategoryService.getById(data);
    if (!category) {
      await ctx.reply('Category not found.');
      return true;
    }

    try {
      const res = await WalletService.reconcile(wallet_id, real_balance, data, owner?.currency || 'IDR');
      await (ctx as any).clearConversationState();

      if (res.type === 'none') {
        await ctx.editMessageText(`✅ Balance of *${wallet_icon} ${wallet_name}* is already *${formatCurrency(real_balance, wallet_currency || 'IDR')}*. No adjustment was needed.`, { parse_mode: 'Markdown' });
      } else {
        const sign = res.type === 'income' ? '+' : '-';
        const typeText = res.type === 'income' ? 'income' : 'expense';
        await ctx.editMessageText(
          `✅ Wallet *${wallet_icon} ${wallet_name}* reconciled!\n` +
          `• New Balance: *${formatCurrency(real_balance, wallet_currency || 'IDR')}*\n` +
          `• Adjustment: *${sign}${formatCurrency(res.diff, wallet_currency || 'IDR')}* (logged as *${typeText}* under category *${category.icon} ${category.name}*)`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (err: any) {
      await ctx.reply(`❌ Failed to reconcile: ${err.message}`);
    }
    return true;
  }

  return false;
};
