import { Context, Markup } from 'telegraf';
import { RecurringService } from '../../services/recurring';
import { CategoryService } from '../../services/category';
import { WalletService } from '../../services/wallet';
import { OwnerService } from '../../services/owner';
import { TransactionService } from '../../services/transaction';
import { formatCurrency, shortId } from '../../utils/formatters';
import {
  buildFrequencyKeyboard,
  buildRecurringTypeKeyboard,
  buildRecurringConfirmKeyboard,
  buildStartDateKeyboard
} from '../../utils/keyboard';
import { formatISO, addDays } from 'date-fns';

export const recurringHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === 'list') {
    await handleRecurringList(ctx);
  } else if (subCommand === 'add') {
    await (ctx as any).setConversationState({
      state: 'recurring_add_desc',
      context: {}
    });
    await ctx.reply('🔄 Adding recurring transaction. Step 1: What is the description? (e.g. Netflix)');
  } else if (subCommand === 'delete') {
    await handleRecurringDeleteDirect(ctx, args.slice(1));
  } else {
    await ctx.reply('Unknown recurring command. Use: /recurring add, /recurring list, or /recurring delete <id>');
  }
};

async function handleRecurringList(ctx: Context) {
  try {
    const entries = await RecurringService.list();
    if (entries.length === 0) {
      await ctx.reply('You have no recurring transactions. Use /recurring add to create one!');
      return;
    }

    const telegramId = ctx.from?.id;
    const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
    const currency = owner?.currency || 'USD';

    for (const entry of entries) {
      const typeEmoji = entry.type === 'income' ? '💰' : entry.type === 'expense' ? '💸' : '🔄';
      let walletStr = '';
      if (entry.type === 'transfer' && entry.wallet && entry.to_wallet) {
        walletStr = `💳 *From/To*: ${entry.wallet.icon} ${entry.wallet.name} ➡️ ${entry.to_wallet.icon} ${entry.to_wallet.name}\n`;
      } else if (entry.wallet) {
        walletStr = `💳 *Wallet*: ${entry.wallet.icon} ${entry.wallet.name}\n`;
      }

      const categoryStr = entry.category ? `📁 *Category*: ${entry.category.icon} ${entry.category.name}\n` : '';

      const card = `🔄 *Recurring Transaction* (\`${shortId(entry.id)}\`)\n\n` +
        `📝 *Description*: ${entry.description}\n` +
        `💰 *Amount*: ${formatCurrency(Number(entry.amount), currency)} (${typeEmoji} ${entry.type})\n` +
        categoryStr +
        walletStr +
        `📅 *Next Due Date*: ${entry.next_due_date}\n` +
        `🔄 *Frequency*: ${entry.frequency.charAt(0).toUpperCase() + entry.frequency.slice(1)}\n` +
        `💡 *Status*: ${entry.active ? '🟢 Active' : '⏸️ Paused'}`;

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback(entry.active ? '⏸️ Pause' : '▶️ Resume', `reccall_pause_${entry.id}`),
        Markup.button.callback('🗑️ Delete', `reccall_delete_${entry.id}`)
      ]);

      await ctx.reply(card, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (err: any) {
    await ctx.reply(`❌ Failed to list recurring transactions: ${err.message}`);
  }
}

async function handleRecurringDeleteDirect(ctx: Context, args: string[]) {
  const arg = args[0]?.trim();
  if (!arg) {
    await ctx.reply('Usage: /recurring delete <short_id>\nExample: /recurring delete a1b2c3');
    return;
  }

  try {
    const entry = await RecurringService.getById(arg);
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🗑️ Yes, delete', `reccall_delconfirm_${entry.id}`),
        Markup.button.callback('❌ No, cancel', `reccall_delcancel_${entry.id}`)
      ]
    ]);
    await ctx.reply(`Are you sure you want to delete the recurring entry *${entry.description}*?`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (err: any) {
    await ctx.reply(`❌ Recurring entry not found.`);
  }
}

export const handleRecurringTextFlow = async (ctx: Context, state: any, text: string) => {
  const { state: currentState, context } = state;

  if (currentState === 'recurring_add_desc') {
    const description = text.trim();
    if (!description) {
      await ctx.reply('Please enter a valid description.');
      return;
    }

    await (ctx as any).setConversationState({
      state: 'recurring_add_amount',
      context: { ...context, description }
    });
    await ctx.reply('Step 2: Enter the amount (e.g. 50000 or 50k):');
  } else if (currentState === 'recurring_add_amount') {
    const amount = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('Please enter a valid positive number.');
      return;
    }

    await (ctx as any).setConversationState({
      state: 'recurring_add_type',
      context: { ...context, amount }
    });
    await ctx.reply('Step 3: Select transaction type:', buildRecurringTypeKeyboard());
  } else if (currentState === 'recdue_edit_amount') {
    const amount = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('Please enter a valid positive number.');
      return;
    }

    try {
      const txnId = context.txnId;
      await TransactionService.update(txnId, { amount });
      await (ctx as any).clearConversationState();
      await ctx.reply(`✏️ Transaction amount updated to ${amount.toLocaleString()} successfully!`);
    } catch (err: any) {
      await ctx.reply(`❌ Failed to update transaction amount: ${err.message}`);
    }
  }
};

const showRecurringConfirmationCard = async (ctx: Context, context: any) => {
  const telegramId = ctx.from?.id;
  const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
  const curr = owner?.currency || 'USD';

  let walletLine = '';
  if (context.type === 'transfer') {
    walletLine = `💳 *From*: ${context.wallet_icon} ${context.wallet_name} ➡️ *To*: ${context.to_wallet_icon} ${context.to_wallet_name}\n`;
  } else if (context.wallet_id) {
    walletLine = `💳 *Wallet*: ${context.wallet_icon} ${context.wallet_name}\n`;
  } else {
    walletLine = `💳 *Wallet*: None\n`;
  }

  const categoryLine = context.category_id ? `📁 *Category*: ${context.category_icon} ${context.category_name}\n` : '';
  const typeEmoji = context.type === 'income' ? '💰' : context.type === 'expense' ? '💸' : '🔄';

  const text = `🔄 *Confirm Recurring Transaction Details*:\n\n` +
    `📝 *Description*: ${context.description}\n` +
    `💰 *Amount*: ${formatCurrency(context.amount, curr)} (${typeEmoji} ${context.type})\n` +
    categoryLine +
    walletLine +
    `🔄 *Frequency*: ${context.frequency.charAt(0).toUpperCase() + context.frequency.slice(1)}\n` +
    `📅 *Start Date*: ${context.next_due_date}`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: buildRecurringConfirmKeyboard().reply_markup
  });
};

export const handleRecurringCallback = async (ctx: Context, action: string, data: string) => {
  const state = (ctx as any).conversationState;
  const currentState = state?.state;
  const context = state?.context || {};

  // ─── Flow Steps ───────────────────────────────────────────────────────────
  if (currentState === 'recurring_add_type' && action === 'rectype') {
    const type = data;
    await (ctx as any).setConversationState({
      state: type === 'transfer' ? 'recurring_add_wallet' : 'recurring_add_category',
      context: { ...context, type }
    });

    if (type === 'transfer') {
      const wallets = await WalletService.list();
      const telegramId = ctx.from?.id;
      const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
      const defaultWalletId = owner?.settings?.default_wallet_id || null;

      const buttons = wallets.map(w => {
        const isDefault = w.id === defaultWalletId || w.is_default;
        const label = `${w.icon} ${w.name}${isDefault ? ' (Default)' : ''}`;
        return Markup.button.callback(label, `recwallet_${w.id}`);
      });
      const rows = [];
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
      }

      await ctx.editMessageText('Step 4: Select FROM wallet:', Markup.inlineKeyboard(rows));
    } else {
      const categories = await CategoryService.getByType(type as 'income' | 'expense');
      const buttons = categories.map(cat => Markup.button.callback(`${cat.icon} ${cat.name}`, `reccat_${cat.id}`));
      const rows = [];
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
      }

      await ctx.editMessageText('Step 4: Select category:', Markup.inlineKeyboard(rows));
    }
  } else if (currentState === 'recurring_add_category' && action === 'reccat') {
    const category = await CategoryService.getById(data);
    if (!category) return;

    await (ctx as any).setConversationState({
      state: 'recurring_add_wallet',
      context: {
        ...context,
        category_id: category.id,
        category_name: category.name,
        category_icon: category.icon
      }
    });

    const wallets = await WalletService.list();
    const telegramId = ctx.from?.id;
    const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
    const defaultWalletId = owner?.settings?.default_wallet_id || null;

    const buttons = wallets.map(w => {
      const isDefault = w.id === defaultWalletId || w.is_default;
      const label = `${w.icon} ${w.name}${isDefault ? ' (Default)' : ''}`;
      return Markup.button.callback(label, `recwallet_${w.id}`);
    });
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    rows.push([Markup.button.callback('⏭️ Skip (No Wallet)', 'recwallet_skip')]);

    await ctx.editMessageText('Step 5: Which wallet to debit/credit?', Markup.inlineKeyboard(rows));
  } else if (currentState === 'recurring_add_wallet' && action === 'recwallet') {
    let walletId: string | null = null;
    let walletName: string | null = null;
    let walletIcon: string | null = null;

    if (data !== 'skip') {
      const wallets = await WalletService.list();
      const wallet = wallets.find(w => w.id === data);
      if (wallet) {
        walletId = wallet.id;
        walletName = wallet.name;
        walletIcon = wallet.icon;
      }
    }

    if (context.type === 'transfer') {
      if (!walletId) return; // Cannot skip wallet in transfer
      await (ctx as any).setConversationState({
        state: 'recurring_add_to_wallet',
        context: { ...context, wallet_id: walletId, wallet_name: walletName, wallet_icon: walletIcon }
      });

      const wallets = await WalletService.list();
      const otherWallets = wallets.filter(w => w.id !== walletId);
      const buttons = otherWallets.map(w => Markup.button.callback(`${w.icon} ${w.name}`, `rectowallet_${w.id}`));
      const rows = [];
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
      }

      await ctx.editMessageText('Step 5: Select TO wallet:', Markup.inlineKeyboard(rows));
    } else {
      await (ctx as any).setConversationState({
        state: 'recurring_add_frequency',
        context: { ...context, wallet_id: walletId, wallet_name: walletName, wallet_icon: walletIcon }
      });

      await ctx.editMessageText('Step 6: Select frequency:', buildFrequencyKeyboard());
    }
  } else if (currentState === 'recurring_add_to_wallet' && action === 'rectowallet') {
    const wallets = await WalletService.list();
    const wallet = wallets.find(w => w.id === data);
    if (!wallet) return;

    await (ctx as any).setConversationState({
      state: 'recurring_add_frequency',
      context: { ...context, to_wallet_id: wallet.id, to_wallet_name: wallet.name, to_wallet_icon: wallet.icon }
    });

    await ctx.editMessageText('Step 6: Select frequency:', buildFrequencyKeyboard());
  } else if (currentState === 'recurring_add_frequency' && action === 'recfreq') {
    const frequency = data;
    await (ctx as any).setConversationState({
      state: 'recurring_add_start_date',
      context: { ...context, frequency }
    });

    await ctx.editMessageText('Step 7: Select start date:', buildStartDateKeyboard());
  } else if (currentState === 'recurring_add_start_date' && action === 'recdate') {
    let dateStr = '';
    if (data === 'today') {
      dateStr = formatISO(new Date(), { representation: 'date' });
    } else if (data === 'tomorrow') {
      dateStr = formatISO(addDays(new Date(), 1), { representation: 'date' });
    }

    await (ctx as any).setConversationState({
      state: 'recurring_add_confirm',
      context: { ...context, next_due_date: dateStr }
    });

    await ctx.deleteMessage().catch(() => {});
    await showRecurringConfirmationCard(ctx, { ...context, next_due_date: dateStr });
  } else if (currentState === 'recurring_add_confirm' && action === 'recconfirm') {
    if (data === 'cancel') {
      await (ctx as any).clearConversationState();
      await ctx.editMessageText('❌ Recurring transaction cancelled.');
    } else if (data === 'edit') {
      await (ctx as any).setConversationState({
        state: 'recurring_add_desc',
        context: {}
      });
      await ctx.editMessageText('🔄 Editing recurring transaction. Step 1: What is the description?');
    } else if (data === 'save') {
      try {
        const entry = await RecurringService.add({
          description: context.description,
          amount: context.amount,
          type: context.type,
          category_id: context.category_id || null,
          wallet_id: context.wallet_id || null,
          to_wallet_id: context.to_wallet_id || null,
          frequency: context.frequency,
          next_due_date: context.next_due_date
        });

        await (ctx as any).clearConversationState();
        await ctx.editMessageText(`✅ Saved! 🔄 Recurring transaction created successfully.\n\nID: \`${shortId(entry.id)}\``, { parse_mode: 'Markdown' });
      } catch (err: any) {
        await ctx.editMessageText(`❌ Failed to save: ${err.message}`);
      }
    }
  }

  // ─── Inline List Actions ───────────────────────────────────────────────────
  else if (action === 'reccall') {
    const parts = data.split('_');
    const subAct = parts[0];
    const entryId = parts.slice(1).join('_');

    if (subAct === 'pause') {
      try {
        const updated = await RecurringService.togglePause(entryId);
        const telegramId = ctx.from?.id;
        const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
        const currency = owner?.currency || 'USD';

        const typeEmoji = updated.type === 'income' ? '💰' : updated.type === 'expense' ? '💸' : '🔄';
        let walletStr = '';
        if (updated.type === 'transfer' && updated.wallet && updated.to_wallet) {
          walletStr = `💳 *From/To*: ${updated.wallet.icon} ${updated.wallet.name} ➡️ ${updated.to_wallet.icon} ${updated.to_wallet.name}\n`;
        } else if (updated.wallet) {
          walletStr = `💳 *Wallet*: ${updated.wallet.icon} ${updated.wallet.name}\n`;
        }

        const categoryStr = updated.category ? `📁 *Category*: ${updated.category.icon} ${updated.category.name}\n` : '';

        const card = `🔄 *Recurring Transaction* (\`${shortId(updated.id)}\`)\n\n` +
          `📝 *Description*: ${updated.description}\n` +
          `💰 *Amount*: ${formatCurrency(Number(updated.amount), currency)} (${typeEmoji} ${updated.type})\n` +
          categoryStr +
          walletStr +
          `📅 *Next Due Date*: ${updated.next_due_date}\n` +
          `🔄 *Frequency*: ${updated.frequency.charAt(0).toUpperCase() + updated.frequency.slice(1)}\n` +
          `💡 *Status*: ${updated.active ? '🟢 Active' : '⏸️ Paused'}`;

        const keyboard = Markup.inlineKeyboard([
          Markup.button.callback(updated.active ? '⏸️ Pause' : '▶️ Resume', `reccall_pause_${updated.id}`),
          Markup.button.callback('🗑️ Delete', `reccall_delete_${updated.id}`)
        ]);

        await ctx.editMessageText(card, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      } catch (err: any) {
        await ctx.reply(`❌ Failed to toggle pause: ${err.message}`);
      }
    } else if (subAct === 'delete') {
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('🗑️ Yes, delete', `reccall_delconfirm_${entryId}`),
        Markup.button.callback('❌ No, cancel', `reccall_delcancel_${entryId}`)
      ]);
      await ctx.editMessageReplyMarkup(keyboard.reply_markup);
    } else if (subAct === 'delconfirm') {
      try {
        await RecurringService.delete(entryId);
        await ctx.editMessageText('🗑️ Recurring entry deleted.');
      } catch (err: any) {
        await ctx.reply(`❌ Failed to delete: ${err.message}`);
      }
    } else if (subAct === 'delcancel') {
      // Revert buttons back
      try {
        const entry = await RecurringService.getById(entryId);
        const keyboard = Markup.inlineKeyboard([
          Markup.button.callback(entry.active ? '⏸️ Pause' : '▶️ Resume', `reccall_pause_${entry.id}`),
          Markup.button.callback('🗑️ Delete', `reccall_delete_${entry.id}`)
        ]);
        await ctx.editMessageReplyMarkup(keyboard.reply_markup);
      } catch (err: any) {
        await ctx.reply(`❌ Failed to cancel: ${err.message}`);
      }
    }
  }

  // ─── Process Due Action Callback Buttons ──────────────────────────────────
  else if (action === 'recdue') {
    const parts = data.split(':');
    const subAct = parts[0];
    const targetId = parts.slice(1).join(':');

    if (subAct === 'ok') {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply('✅ Auto-logged transaction acknowledged!');
    } else if (subAct === 'edit') {
      await (ctx as any).setConversationState({
        state: 'recdue_edit_amount',
        context: { txnId: targetId }
      });
      await ctx.reply('✏️ Enter the new amount for this auto-logged transaction (e.g. 240k or 240000):');
    } else if (subAct === 'pause') {
      try {
        await RecurringService.togglePause(targetId);
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.reply('⏸️ Recurring entry has been paused! Future intervals will not be logged until you resume it.');
      } catch (err: any) {
        await ctx.reply(`❌ Failed to pause: ${err.message}`);
      }
    }
  }
};
