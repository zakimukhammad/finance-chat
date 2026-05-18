import { Context, Markup } from 'telegraf';
import { BudgetService } from '../../services/budget';
import { CategoryService } from '../../services/category';
import { OwnerService } from '../../services/owner';
import { formatCurrency, formatPercent, progressBar } from '../../utils/formatters';
import { buildCategoriesKeyboard } from '../../utils/keyboard';

export const budgetHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === 'status') {
    await handleBudgetStatus(ctx);
  } else if (subCommand === 'set') {
    // Expected: /budget set <cat> <amount> OR just /budget set
    const amountStr = args.length > 2 ? args.pop() : null;
    const catName = args.slice(1).join(' ').trim() || null;

    if (catName && amountStr) {
      await handleBudgetSetDirect(ctx, catName, amountStr);
    } else {
      await handleBudgetSetInteractive(ctx);
    }
  } else if (subCommand === 'delete') {
    const catName = args.slice(1).join(' ').trim();
    if (!catName) {
      await ctx.reply('Please specify a category to delete its budget, e.g. /budget delete Food');
      return;
    }
    await handleBudgetDelete(ctx, catName);
  } else {
    await ctx.reply('Unknown budget command. Use: /budget status, /budget set, or /budget delete');
  }
};

async function handleBudgetStatus(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) return;

  const statuses = await BudgetService.getStatus();

  if (statuses.length === 0) {
    await ctx.reply('You have no budgets set. Use /budget set to create one.');
    return;
  }

  let text = `📊 *Budget Status*\n\n`;

  for (const status of statuses) {
    text += `*${status.icon} ${status.category_name}*\n`;
    text += `${progressBar(status.pct_used, 12)} ${formatPercent(status.pct_used)}\n`;
    text += `${formatCurrency(status.spent, owner.currency)} / ${formatCurrency(status.budget_amount, owner.currency)}\n\n`;
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

async function handleBudgetSetInteractive(ctx: Context) {
  const categories = await CategoryService.getByType('expense'); // Budgets are only for expenses usually
  
  await (ctx as any).setConversationState({
    state: 'budget_set_category',
    context: {}
  });

  await ctx.reply('Which category do you want to set a budget for?', buildCategoriesKeyboard(categories, 'expense'));
}

async function handleBudgetSetDirect(ctx: Context, catName: string, amountStr: string) {
  const amount = parseFloat(amountStr.replace(/,/g, '').replace(/[kK]$/, '000'));
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('Please provide a valid positive amount.');
    return;
  }

  const categories = await CategoryService.getByType('expense');
  const cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());

  if (!cat) {
    await ctx.reply(`Category "${catName}" not found. Ensure it's spelled correctly.`);
    return;
  }

  await BudgetService.set(cat.id, amount);
  await ctx.reply(`✅ Budget set! ${cat.icon} ${cat.name} limit is now ${amount}.`);
}

async function handleBudgetDelete(ctx: Context, catName: string) {
  const categories = await CategoryService.getByType('expense');
  const cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());

  if (!cat) {
    await ctx.reply(`Category "${catName}" not found.`);
    return;
  }

  await BudgetService.delete(cat.id);
  await ctx.reply(`🗑️ Budget for ${cat.icon} ${cat.name} removed.`);
}

export const handleBudgetCallback = async (ctx: Context, action: string, data: string) => {
  const state = (ctx as any).conversationState;
  if (!state || state.state !== 'budget_set_category') return false;

  if (action === 'cat') {
    const category = await CategoryService.getById(data);
    if (!category) return true;

    await (ctx as any).setConversationState({
      state: 'budget_set_amount',
      context: { category_id: category.id, category_name: category.name, category_icon: category.icon }
    });

    await ctx.editMessageText(`Set monthly budget limit for ${category.icon} ${category.name}:\n(Type the amount, e.g., 500000 or 500k)`);
    return true;
  }
  return false;
};

export const handleBudgetAmountFlow = async (ctx: Context, state: any, text: string) => {
  if (state.state === 'budget_set_amount') {
    const amount = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('Please enter a valid positive number.');
      return true;
    }

    const { category_id, category_name, category_icon } = state.context;
    await BudgetService.set(category_id, amount);
    await (ctx as any).clearConversationState();

    const owner = await OwnerService.getOwner(ctx.from?.id!);
    await ctx.reply(`✅ Budget set! Your monthly limit for ${category_icon} ${category_name} is now *${formatCurrency(amount, owner?.currency || 'IDR')}*.`, { parse_mode: 'Markdown' });
    return true;
  }
  return false;
};
