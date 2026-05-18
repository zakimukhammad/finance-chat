import { Context, Markup } from 'telegraf';
import { CategoryService } from '../../services/category';
import { TransactionService } from '../../services/transaction';
import { OwnerService } from '../../services/owner';
import { buildCategoriesKeyboard, buildDateKeyboard, buildConfirmationKeyboard } from '../../utils/keyboard';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { formatISO, subDays } from 'date-fns';

export const addHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const type = args[0]?.toLowerCase();

  if (type !== 'expense' && type !== 'income') {
    await ctx.reply('Please specify: /add expense or /add income');
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

    const categories = await CategoryService.getByType(context.type);
    
    await (ctx as any).setConversationState({
      state: 'add_category',
      context: { ...context, amount }
    });

    await ctx.reply('Select category:', buildCategoriesKeyboard(categories, context.type));
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

    await (ctx as any).setConversationState({
      state: 'add_date',
      context: { ...context, category_id: category.id, category_name: category.name, category_icon: category.icon }
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
        category_id: context.category_id,
        description: context.description,
        date: context.date,
        source: 'manual'
      });

      await (ctx as any).clearConversationState();
      await ctx.editMessageText(`Saved! 📊\nTransaction ID: \`${tx.id.split('-')[0]}\``, {
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

  const text = `Please confirm details:\n\n` +
    `💰 **Amount**: ${formatCurrency(context.amount, curr)}\n` +
    `📁 **Category**: ${context.category_icon} ${context.category_name}\n` +
    `📅 **Date**: ${formatDate(context.date)}\n` +
    `📝 **Description**: ${context.description || '-'}\n`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: buildConfirmationKeyboard().reply_markup
  });
};
