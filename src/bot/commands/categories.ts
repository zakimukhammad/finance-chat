import { Context, Markup } from 'telegraf';
import { CategoryService } from '../../services/category';
import { getSupabase } from '../../db/client';
import { buildCategoryTypeKeyboard, buildCategoryDeleteConfirmKeyboard } from '../../utils/keyboard';

export const categoriesHandler = async (ctx: Context) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);

  if (args.length > 0) {
    const subCommand = args[0].toLowerCase();
    if (subCommand === 'add') {
      await handleAddCategoryCommand(ctx, args.slice(1));
      return;
    } else if (subCommand === 'delete') {
      await handleDeleteCategoryCommand(ctx, args.slice(1));
      return;
    }
  }

  // Default: list all categories
  const categories = await CategoryService.getAll();
  
  let text = `📂 *Categories*\n\n`;
  const systemCats = categories.filter(c => c.is_system);
  const customCats = categories.filter(c => !c.is_system);

  text += `*System Categories:*\n`;
  for (const c of systemCats) {
    text += `• ${c.icon} ${c.name} (${c.type})\n`;
  }

  if (customCats.length > 0) {
    text += `\n*Custom Categories:*\n`;
    for (const c of customCats) {
      text += `• ${c.icon} ${c.name} (${c.type})\n`;
    }
  }

  // Build delete buttons for custom categories if any
  if (customCats.length > 0) {
    const buttons = customCats.map(c => 
      Markup.button.callback(`🗑️ Delete ${c.icon} ${c.name}`, `catdelreq_${c.id}`)
    );
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(rows)
    });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  }
};

async function handleAddCategoryCommand(ctx: Context, args: string[]) {
  if (args.length < 2) {
    await ctx.reply('⚠️ Usage: `/categories add <name> <icon>` (e.g. `/categories add Groceries 🥦`)', { parse_mode: 'Markdown' });
    return;
  }

  const name = args[0].trim();
  const icon = args[1].trim();

  // If a third argument is passed, it could be the type
  let type: 'expense' | 'income' | 'both' | null = null;
  if (args[2]) {
    const t = args[2].toLowerCase().trim();
    if (t === 'expense' || t === 'income' || t === 'both') {
      type = t as any;
    }
  }

  if (type) {
    try {
      const cat = await CategoryService.add(name, icon, type);
      await ctx.reply(`✅ Category ${cat.icon} *${cat.name}* (${cat.type}) added.`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      await ctx.reply(`⚠️ ${err.message}`);
    }
  } else {
    // Ask for type via inline keyboard
    await (ctx as any).setConversationState({
      state: 'categories_add_type',
      context: { name, icon }
    });
    await ctx.reply(`Select type for category ${icon} *${name}*:`, {
      parse_mode: 'Markdown',
      ...buildCategoryTypeKeyboard()
    });
  }
}

async function handleDeleteCategoryCommand(ctx: Context, args: string[]) {
  if (args.length === 0) {
    await ctx.reply('⚠️ Usage: `/categories delete <name>`', { parse_mode: 'Markdown' });
    return;
  }

  const query = args.join(' ').trim();
  const categories = await CategoryService.getAll();
  
  // Fuzzy match
  let cat = categories.find(c => c.name.toLowerCase() === query.toLowerCase());
  if (!cat) {
    cat = categories.find(c => c.name.toLowerCase().includes(query.toLowerCase()));
  }

  if (!cat) {
    await ctx.reply(`⚠️ Category "${query}" not found.`);
    return;
  }

  if (cat.is_system) {
    await ctx.reply(`⚠️ System category ${cat.icon} *${cat.name}* cannot be deleted.`, { parse_mode: 'Markdown' });
    return;
  }

  // Check transactions
  const { count, error } = await getSupabase()
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', cat.id);

  if (error) {
    await ctx.reply('⚠️ Failed to check transactions.');
    return;
  }

  if (count && count > 0) {
    await ctx.reply(`⚠️ Cannot delete — used by ${count} transactions.`);
    return;
  }

  await ctx.reply(`Are you sure you want to delete category ${cat.icon} *${cat.name}*?`, {
    parse_mode: 'Markdown',
    ...buildCategoryDeleteConfirmKeyboard(cat.id)
  });
}

export const handleCategoryCallback = async (ctx: Context, action: string, val: string) => {
  if (action === 'cattype') {
    const state = (ctx as any).conversationState;
    if (state?.state !== 'categories_add_type') return;

    const { name, icon } = state.context;
    let type: 'expense' | 'income' | 'both' = 'expense';
    if (val === 'income') type = 'income';
    else if (val === 'both') type = 'both';

    try {
      const cat = await CategoryService.add(name, icon, type);
      await (ctx as any).clearConversationState();
      await ctx.editMessageText(`✅ Category ${cat.icon} *${cat.name}* (${cat.type}) added.`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      await (ctx as any).clearConversationState();
      await ctx.editMessageText(`⚠️ ${err.message}`);
    }
  } else if (action === 'catdelreq') {
    // Delete requested via inline button
    const cat = await CategoryService.getById(val);
    if (!cat) {
      await ctx.reply('⚠️ Category not found.');
      return;
    }

    if (cat.is_system) {
      await ctx.reply(`⚠️ System category ${cat.icon} *${cat.name}* cannot be deleted.`, { parse_mode: 'Markdown' });
      return;
    }

    const { count } = await getSupabase()
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id);

    if (count && count > 0) {
      await ctx.reply(`⚠️ Cannot delete — used by ${count} transactions.`);
      return;
    }

    await ctx.reply(`Are you sure you want to delete category ${cat.icon} *${cat.name}*?`, {
      parse_mode: 'Markdown',
      ...buildCategoryDeleteConfirmKeyboard(cat.id)
    });
  } else if (action === 'catdelconf') {
    // Confirmed delete
    const cat = await CategoryService.getById(val);
    if (!cat) {
      await ctx.editMessageText('⚠️ Category not found.');
      return;
    }

    try {
      await CategoryService.delete(cat.id);
      await ctx.editMessageText(`✅ Category ${cat.icon} *${cat.name}* successfully deleted.`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      await ctx.editMessageText(`⚠️ ${err.message}`);
    }
  } else if (action === 'catdelcancel') {
    await ctx.editMessageText('Deletion cancelled.');
  }
};
