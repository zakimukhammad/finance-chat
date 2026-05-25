import { Context } from 'telegraf';
import { ReportService } from '../../services/report';
import { format, startOfMonth } from 'date-fns';
import { logger } from '../../utils/logger';

/**
 * Common logic to generate, upload, and send the export report.
 */
export async function runExport(ctx: Context, type: 'csv' | 'pdf', yearMonth?: string) {
  let periodLabel = '';
  let filename = '';
  let contentType = '';

  try {
    let dateObj: Date;
    if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [year, month] = yearMonth.split('-').map(Number);
      dateObj = new Date(year, month - 1, 1);
    } else {
      dateObj = new Date();
    }
    
    const formattedPeriod = format(startOfMonth(dateObj), 'yyyy-MM');
    periodLabel = format(dateObj, 'MMMM yyyy');

    if (type === 'csv') {
      filename = `financebot_export_${formattedPeriod}.csv`;
      contentType = 'text/csv';
    } else {
      filename = `financebot_report_${formattedPeriod}.pdf`;
      contentType = 'application/pdf';
    }

    // Send immediate progress message
    const progressMessage = await ctx.reply(`⏳ Generating your ${type.toUpperCase()} export for ${periodLabel}...`);

    let buffer: Buffer;
    if (type === 'csv') {
      buffer = await ReportService.generateCSV(yearMonth);
    } else {
      buffer = await ReportService.generatePDF(yearMonth);
    }

    // Upload to R2 and get presigned URL
    const presignedUrl = await ReportService.uploadToR2(filename, buffer, contentType);
    logger.info({ filename, presignedUrl }, 'Uploaded report to R2 successfully');

    // Deliver as Telegram Document
    await ctx.replyWithDocument(
      { url: presignedUrl, filename: filename },
      { caption: `✅ Here is your ${type.toUpperCase()} report for ${periodLabel}.` }
    );

    // Delete progress message to clean up chat
    await ctx.deleteMessage(progressMessage.message_id).catch((err) => {
      logger.warn({ err }, 'Failed to delete progress message');
    });

  } catch (error: any) {
    logger.error({ error, type, yearMonth }, 'Failed to run export');
    await ctx.reply(`⚠️ Failed to generate export: ${error.message || error}`);
  }
}

/**
 * Command handler for /export <csv|pdf> [YYYY-MM]
 */
export const exportHandler = async (ctx: Context) => {
  const message = (ctx.message as any)?.text || '';
  const args = message.split(' ').slice(1);
  
  if (args.length === 0) {
    await ctx.reply(
      '⚠️ *Usage*:\n' +
      '• `/export csv` - Export current month as CSV\n' +
      '• `/export csv <YYYY-MM>` - Export specific month as CSV\n' +
      '• `/export pdf` - Export current month as PDF\n' +
      '• `/export pdf <YYYY-MM>` - Export specific month as PDF',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const type = args[0].toLowerCase();
  if (type !== 'csv' && type !== 'pdf') {
    await ctx.reply('⚠️ Invalid export format. Choose either `csv` or `pdf`.');
    return;
  }

  const yearMonth = args[1];
  if (yearMonth && !/^\d{4}-\d{2}$/.test(yearMonth)) {
    await ctx.reply('⚠️ Invalid month format. Use YYYY-MM (e.g. 2026-04).');
    return;
  }

  await runExport(ctx, type as 'csv' | 'pdf', yearMonth);
};
