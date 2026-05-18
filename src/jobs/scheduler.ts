import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { BudgetService } from '../services/budget';
import { logger } from '../utils/logger';

/**
 * Register all scheduled cron jobs for the bot.
 */
export function registerJobs(bot: Telegraf): void {
  // Check budget alerts every hour
  cron.schedule('0 * * * *', () => {
    logger.info('Running hourly budget alert check');
    BudgetService.checkAndAlert(bot).catch(err => {
      logger.error({ err }, 'Budget checkAndAlert failed');
    });
  }, { timezone: 'UTC' });

  // Reset budget alert flags on the 1st of each month at 00:01 UTC
  cron.schedule('1 0 1 * *', () => {
    logger.info('Running monthly budget alert reset');
    BudgetService.resetAlertFlags().catch(err => {
      logger.error({ err }, 'Budget resetAlertFlags failed');
    });
  }, { timezone: 'UTC' });

  // (Placeholders for Milestone 1.5 - Goals, Milestone 1.6 - Recurring, Milestone 1.7 - Currency, Milestone 1.8 - Digests)
  logger.info('All cron jobs registered successfully');
}
