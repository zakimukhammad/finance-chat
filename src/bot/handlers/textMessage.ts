import { Context } from 'telegraf';
import { handleAddFlow } from '../commands/add';
import { logger } from '../../utils/logger';

export const textMessageHandler = async (ctx: Context) => {
  const text = (ctx.message as any)?.text;
  if (!text || text.startsWith('/')) return;

  const state = (ctx as any).conversationState;

  if (state) {
    // Route to active flow
    if (state.state.startsWith('add_')) {
      await handleAddFlow(ctx, state, text);
      return;
    }
    // Other flows like /recurring add, /budget set etc can be routed here
  } else {
    // NLP Fast-path & AI routing will go here (Milestone 1.3)
    // For M1.2, if no state, we can guide them
    await ctx.reply('Type /add expense or /add income to log manually, or /help.');
  }
};
