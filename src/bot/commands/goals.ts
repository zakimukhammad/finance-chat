import { Context, Markup } from 'telegraf';
import { GoalService } from '../../services/goal';
import { OwnerService } from '../../services/owner';
import { formatCurrency, progressBar } from '../../utils/formatters';
import { differenceInDays, parseISO } from 'date-fns';

export const goalHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === 'list') {
    await handleGoalList(ctx);
  } else if (subCommand === 'set') {
    await handleGoalSet(ctx, args.slice(1));
  } else if (subCommand === 'add') {
    await handleGoalAdd(ctx, args.slice(1));
  } else if (subCommand === 'delete') {
    await handleGoalDelete(ctx, args.slice(1));
  } else {
    await ctx.reply('Unknown goal command. Use: /goal set, /goal add, /goal list, or /goal delete');
  }
};

async function handleGoalSet(ctx: Context, setArgs: string[]) {
  if (setArgs.length < 2) {
    await ctx.reply('Usage: /goal set <name> <target> [YYYY-MM-DD]\nExample: /goal set Laptop 1500 2026-12-31');
    return;
  }

  let deadline: string | null = null;
  let targetStr: string;
  let name: string;

  const lastArg = setArgs[setArgs.length - 1];
  const secondLastArg = setArgs[setArgs.length - 2];

  // Simple date regex: YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateRegex.test(lastArg)) {
    deadline = lastArg;
    targetStr = secondLastArg;
    name = setArgs.slice(0, -2).join(' ').trim();
  } else {
    targetStr = lastArg;
    name = setArgs.slice(0, -1).join(' ').trim();
  }

  if (!name) {
    await ctx.reply('Please specify a valid goal name.');
    return;
  }

  const target = parseFloat(targetStr.replace(/,/g, '').replace(/[kK]$/, '000'));
  if (isNaN(target) || target <= 0) {
    await ctx.reply('Please provide a valid positive target amount.');
    return;
  }

  try {
    const goal = await GoalService.create(name, target, null, deadline);
    const telegramId = ctx.from?.id;
    const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
    const currency = owner?.currency || 'USD';

    const formattedTarget = formatCurrency(target, currency);
    let deadlineStr = '';
    if (deadline) {
      deadlineStr = ` with deadline *${deadline}*`;
    }
    await ctx.reply(
      `🎯 *Savings Goal Created!*\n\n` +
      `📌 *Goal*: ${goal.name}\n` +
      `🎯 *Target*: ${formattedTarget}${deadlineStr}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    await ctx.reply(`❌ Failed to create goal: ${err.message}`);
  }
}

async function handleGoalAdd(ctx: Context, addArgs: string[]) {
  if (addArgs.length < 2) {
    await ctx.reply('Usage: /goal add <name> <amount>\nExample: /goal add Laptop 200');
    return;
  }

  const amountStr = addArgs[addArgs.length - 1];
  const name = addArgs.slice(0, -1).join(' ').trim();

  const amount = parseFloat(amountStr.replace(/,/g, '').replace(/[kK]$/, '000'));
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('Please enter a valid contribution amount.');
    return;
  }

  try {
    const goal = await GoalService.contribute(name, amount);
    const telegramId = ctx.from?.id;
    const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
    const currency = owner?.currency || 'USD';

    const formattedAmount = formatCurrency(amount, currency);
    const formattedSaved = formatCurrency(Number(goal.current_amount), currency);
    const formattedTarget = formatCurrency(Number(goal.target_amount), currency);

    let replyMsg = `💰 *Contributed to ${goal.name}!*\n\n` +
                   `➕ *Added*:  ${formattedAmount}\n` +
                   `📈 *Saved*:  ${formattedSaved} / ${formattedTarget}`;

    if (goal.status === 'completed') {
      replyMsg = `🎉 *Goal '${goal.name}' reached!*\n\n` +
                 `Outstanding achievement! You've successfully saved ${formattedSaved} to fully fund this goal! 🚀`;
    }

    await ctx.reply(replyMsg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`❌ Failed to contribute: ${err.message}`);
  }
}

async function handleGoalDelete(ctx: Context, delArgs: string[]) {
  const name = delArgs.join(' ').trim();
  if (!name) {
    await ctx.reply('Please specify the goal name to delete.\nExample: /goal delete Laptop');
    return;
  }

  const goal = await GoalService.getByNameOrId(name);
  if (!goal) {
    await ctx.reply(`Goal "${name}" not found.`);
    return;
  }

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🗑️ Yes, delete', `goal_delconfirm_${goal.id}`),
      Markup.button.callback('❌ No, cancel', `goal_delcancel_${goal.id}`)
    ]
  ]);

  await ctx.reply(`Are you sure you want to delete the savings goal *${goal.name}*?`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

async function handleGoalList(ctx: Context) {
  try {
    const goals = await GoalService.list();
    if (goals.length === 0) {
      await ctx.reply('You have no active savings goals. Use /goal set to create one!');
      return;
    }

    const telegramId = ctx.from?.id;
    const owner = telegramId ? await OwnerService.getOwner(telegramId) : null;
    const currency = owner?.currency || 'USD';

    for (const goal of goals) {
      const target = Number(goal.target_amount);
      const current = Number(goal.current_amount);
      const pct = Math.min(100, Math.round((current / target) * 100));
      const bar = progressBar(pct, 10);

      const formattedSaved = formatCurrency(current, currency);
      const formattedTarget = formatCurrency(target, currency);

      let card = `🎯 *${goal.name}*\n` +
                 `${bar} ${pct}%\n` +
                 `💰 *Saved*: ${formattedSaved} / ${formattedTarget}\n`;

      if (goal.deadline) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadlineDate = parseISO(goal.deadline);
        const daysLeft = differenceInDays(deadlineDate, today);

        let dateLine = `📅 *Deadline*: ${goal.deadline} `;
        if (daysLeft > 0) {
          dateLine += `(${daysLeft} days left)\n`;
        } else if (daysLeft === 0) {
          dateLine += `(today!)\n`;
        } else {
          dateLine += `(overdue by ${Math.abs(daysLeft)} days)\n`;
        }
        card += dateLine;

        const remaining = target - current;
        if (remaining > 0) {
          const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30.4));
          const perMonth = Math.round(remaining / monthsLeft);
          const formattedRemaining = formatCurrency(remaining, currency);
          const formattedPerMonth = formatCurrency(perMonth, currency);
          card += `💡 *Need*:  ${formattedRemaining} more (~${formattedPerMonth}/month)\n`;
        }
      } else {
        card += `📅 *Deadline*: No deadline\n`;
      }

      if (goal.status === 'completed') {
        card += `✅ *Status*: Completed! 🎉\n`;
      }

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Add funds', `goal_add_${goal.id}`),
          Markup.button.callback('✏️ Edit', `goal_edit_${goal.id}`),
          Markup.button.callback('🗑️ Delete', `goal_delete_${goal.id}`)
        ]
      ]);

      await ctx.reply(card, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (err: any) {
    await ctx.reply(`❌ Failed to list goals: ${err.message}`);
  }
}

export const handleGoalCallback = async (ctx: Context, data: string) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const parts = data.split('_');
  const action = parts[1];
  const goalId = parts.slice(2).join('_');

  const goal = await GoalService.getByNameOrId(goalId);
  if (!goal) {
    await ctx.answerCbQuery('Goal not found.').catch(() => {});
    return;
  }

  if (action === 'add') {
    await (ctx as any).setConversationState({
      state: 'goal_add_funds',
      context: { goal_id: goal.id, goal_name: goal.name }
    });
    await ctx.reply(`How much would you like to contribute to *${goal.name}*?\n(Type the amount, e.g. 200000 or 200k)`, { parse_mode: 'Markdown' });
  } else if (action === 'edit') {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📝 Name', `goal_editname_${goal.id}`),
        Markup.button.callback('🎯 Target', `goal_edittarget_${goal.id}`),
        Markup.button.callback('📅 Deadline', `goal_editdeadline_${goal.id}`)
      ],
      [
        Markup.button.callback('❌ Cancel', `goal_editcancel_${goal.id}`)
      ]
    ]);
    await ctx.editMessageText(`✏️ *Edit Goal: ${goal.name}*\nWhat would you like to change?`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } else if (action === 'editname') {
    await (ctx as any).setConversationState({
      state: 'goal_edit_name',
      context: { goal_id: goal.id, goal_name: goal.name }
    });
    await ctx.reply(`Please enter a new name for your goal *${goal.name}*:`, { parse_mode: 'Markdown' });
  } else if (action === 'edittarget') {
    await (ctx as any).setConversationState({
      state: 'goal_edit_target',
      context: { goal_id: goal.id, goal_name: goal.name }
    });
    await ctx.reply(`Please enter the new target amount for *${goal.name}*:`, { parse_mode: 'Markdown' });
  } else if (action === 'editdeadline') {
    await (ctx as any).setConversationState({
      state: 'goal_edit_deadline',
      context: { goal_id: goal.id, goal_name: goal.name }
    });
    await ctx.reply(`Please enter the new deadline (YYYY-MM-DD) for *${goal.name}* (or type *none* to remove deadline):`, { parse_mode: 'Markdown' });
  } else if (action === 'editcancel') {
    await (ctx as any).clearConversationState();
    await ctx.editMessageText(`Cancelled editing *${goal.name}*.`, { parse_mode: 'Markdown' });
  } else if (action === 'delete') {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🗑️ Yes, delete', `goal_delconfirm_${goal.id}`),
        Markup.button.callback('❌ No, cancel', `goal_delcancel_${goal.id}`)
      ]
    ]);
    await ctx.editMessageText(`⚠️ Are you sure you want to delete the savings goal *${goal.name}*?`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } else if (action === 'delconfirm') {
    await GoalService.delete(goal.id);
    await ctx.editMessageText(`🗑️ Savings goal *${goal.name}* deleted.`, { parse_mode: 'Markdown' });
  } else if (action === 'delcancel') {
    await ctx.editMessageText(`Cancelled deleting *${goal.name}*.`, { parse_mode: 'Markdown' });
  }
};

export const handleGoalTextFlow = async (ctx: Context, state: any, text: string) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return false;

  const owner = await OwnerService.getOwner(telegramId);
  const currency = owner?.currency || 'USD';

  if (state.state === 'goal_add_funds') {
    const amount = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('Please enter a valid positive number.');
      return true;
    }

    const { goal_id } = state.context;
    try {
      const goal = await GoalService.contribute(goal_id, amount);
      await (ctx as any).clearConversationState();

      const formattedAmount = formatCurrency(amount, currency);
      const formattedSaved = formatCurrency(Number(goal.current_amount), currency);
      const formattedTarget = formatCurrency(Number(goal.target_amount), currency);

      let replyMsg = `💰 *Contributed to ${goal.name}!*\n\n` +
                     `➕ *Added*:  ${formattedAmount}\n` +
                     `📈 *Saved*:  ${formattedSaved} / ${formattedTarget}`;

      if (goal.status === 'completed') {
        replyMsg = `🎉 *Goal '${goal.name}' reached!*\n\n` +
                   `Outstanding achievement! You've successfully saved ${formattedSaved} to fully fund this goal! 🚀`;
      }

      await ctx.reply(replyMsg, { parse_mode: 'Markdown' });
    } catch (err: any) {
      await ctx.reply(`❌ Failed to add funds: ${err.message}`);
    }
    return true;
  }

  if (state.state === 'goal_edit_name') {
    const newName = text.trim();
    if (!newName) {
      await ctx.reply('Please enter a valid name.');
      return true;
    }

    const { goal_id, goal_name } = state.context;
    try {
      await GoalService.update(goal_id, { name: newName });
      await (ctx as any).clearConversationState();
      await ctx.reply(`✅ Goal name updated from *${goal_name}* to *${newName}*!`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      await ctx.reply(`❌ Failed to update goal name: ${err.message}`);
    }
    return true;
  }

  if (state.state === 'goal_edit_target') {
    const target = parseFloat(text.replace(/,/g, '').replace(/[kK]$/, '000'));
    if (isNaN(target) || target <= 0) {
      await ctx.reply('Please enter a valid positive number for the target.');
      return true;
    }

    const { goal_id, goal_name } = state.context;
    try {
      await GoalService.update(goal_id, { target_amount: target });
      await (ctx as any).clearConversationState();
      await ctx.reply(`✅ Goal *${goal_name}* target amount updated to *${formatCurrency(target, currency)}*!`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      await ctx.reply(`❌ Failed to update target: ${err.message}`);
    }
    return true;
  }

  if (state.state === 'goal_edit_deadline') {
    const input = text.trim().toLowerCase();
    const { goal_id, goal_name } = state.context;

    let deadline: string | null = null;
    if (input !== 'none') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(input)) {
        await ctx.reply('Please enter a valid date in YYYY-MM-DD format, or type *none* to remove deadline.');
        return true;
      }
      deadline = input;
    }

    try {
      await GoalService.update(goal_id, { deadline });
      await (ctx as any).clearConversationState();
      if (deadline) {
        await ctx.reply(`✅ Goal *${goal_name}* deadline updated to *${deadline}*!`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`✅ Goal *${goal_name}* deadline removed!`, { parse_mode: 'Markdown' });
      }
    } catch (err: any) {
      await ctx.reply(`❌ Failed to update deadline: ${err.message}`);
    }
    return true;
  }

  return false;
};
