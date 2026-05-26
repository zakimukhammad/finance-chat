import { Context } from 'telegraf';
import { InsightService } from '../../services/insight';
import { buildInsightsFooterKeyboard } from '../../utils/keyboard';
import { format, startOfMonth } from 'date-fns';
import { logger } from '../../utils/logger';

/**
 * Common logic to generate and send insights to the user.
 */
export async function runInsights(ctx: Context, yearMonth?: string) {
  let periodLabel = '';
  let formatPeriod = '';

  try {
    let dateObj: Date;
    if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [year, month] = yearMonth.split('-').map(Number);
      dateObj = new Date(year, month - 1, 1);
    } else {
      dateObj = new Date();
    }

    formatPeriod = format(startOfMonth(dateObj), 'yyyy-MM');
    periodLabel = format(dateObj, 'MMMM yyyy');

    // Send immediate progress message
    const progressMessage = await ctx.reply('⏳ Generating your insights…');

    // Call service to generate insights
    const insightsText = await InsightService.generate(yearMonth);

    // Prepare header label
    const header = `💡 *${periodLabel} Spending Insights*\n\n`;

    // Deliver insights
    await ctx.reply(`${header}${insightsText}`, {
      parse_mode: 'Markdown',
      ...buildInsightsFooterKeyboard(formatPeriod),
    });

    // Delete progress message
    await ctx.deleteMessage(progressMessage.message_id).catch((err) => {
      logger.warn({ err }, 'Failed to delete insights progress message');
    });

  } catch (error: any) {
    logger.error({ error, yearMonth }, 'Failed to run insights command');
    await ctx.reply(`⚠️ Failed to generate insights: ${error.message || error}`);
  }
}

/**
 * Command handler for /insights [YYYY-MM]
 */
export const insightsHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  const yearMonth = args[0];

  if (yearMonth && !/^\d{4}-\d{2}$/.test(yearMonth)) {
    await ctx.reply('⚠️ Invalid month format. Use YYYY-MM (e.g. 2026-05).');
    return;
  }

  await runInsights(ctx, yearMonth);
};
