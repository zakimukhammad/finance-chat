import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { BudgetService } from '../services/budget';
import { GoalService } from '../services/goal';
import { getSupabase } from '../db/client';
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

  // Goal deadline reminders every day at 09:00 owner local time
  getSupabase().from('owner').select('timezone').single().then(({ data }) => {
    const tz = data?.timezone || 'UTC';
    cron.schedule('0 9 * * *', () => {
      logger.info('Running daily goal deadline reminders');
      GoalService.sendDeadlineReminders(bot).catch(err => {
        logger.error({ err }, 'Goal sendDeadlineReminders failed');
      });
    }, { timezone: tz });
    logger.info({ timezone: tz }, 'Scheduled goal deadline reminders');
  }).catch(err => {
    logger.warn({ err }, 'Failed to fetch owner timezone for Goal reminders, falling back to UTC');
    cron.schedule('0 9 * * *', () => {
      logger.info('Running daily goal deadline reminders (fallback UTC)');
      GoalService.sendDeadlineReminders(bot).catch(err => {
        logger.error({ err }, 'Goal sendDeadlineReminders failed');
      });
    }, { timezone: 'UTC' });
  });

  // (Placeholders for Milestone 1.6 - Recurring, Milestone 1.7 - Currency, Milestone 1.8 - Digests)
  logger.info('All cron jobs registered successfully');
}
