import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { BudgetService } from '../services/budget';
import { GoalService } from '../services/goal';
import { RecurringService } from '../services/recurring';
import { CurrencyService } from '../services/currency';
import { getSupabase } from '../db/client';
import { logger } from '../utils/logger';
import { toZonedTime } from 'date-fns-tz';
import { runDailyDigest } from './dailyDigest';
import { runWeeklyDigest } from './weeklyDigest';

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

  // Process recurring transactions every day at 00:05 UTC (Milestone 1.7)
  cron.schedule('5 0 * * *', () => {
    logger.info('Running daily recurring transactions check');
    RecurringService.processDue(bot).catch(err => {
      logger.error({ err }, 'Recurring processDue failed');
    });
  }, { timezone: 'UTC' });

  // Goal deadline reminders every day at 09:00 owner local time
  (async () => {
    try {
      const { data } = await getSupabase().from('owner').select('timezone').single();
      const tz = data?.timezone || 'UTC';
      cron.schedule('0 9 * * *', () => {
        logger.info('Running daily goal deadline reminders');
        GoalService.sendDeadlineReminders(bot).catch(err => {
          logger.error({ err }, 'Goal sendDeadlineReminders failed');
        });
      }, { timezone: tz });
      logger.info({ timezone: tz }, 'Scheduled goal deadline reminders');
    } catch (err) {
      logger.warn({ err }, 'Failed to fetch owner timezone for Goal reminders, falling back to UTC');
      cron.schedule('0 9 * * *', () => {
        logger.info('Running daily goal deadline reminders (fallback UTC)');
        GoalService.sendDeadlineReminders(bot).catch(err => {
          logger.error({ err }, 'Goal sendDeadlineReminders failed');
        });
      }, { timezone: 'UTC' });
    }
  })();

  // Refresh exchange rates every day at 00:10 UTC (Milestone 1.9)
  cron.schedule('10 0 * * *', () => {
    logger.info('Running daily exchange rates refresh');
    CurrencyService.refreshRates().catch(err => {
      logger.error({ err }, 'Exchange rates refresh failed');
    });
  }, { timezone: 'UTC' });

  // Hourly check for daily and weekly digests (Milestone 1.12)
  cron.schedule('0 * * * *', () => {
    logger.info('Running hourly digest checks');
    (async () => {
      try {
        const { data: owner } = await getSupabase().from('owner').select('*').single();
        if (!owner) return;

        const tz = owner.timezone || 'UTC';
        const localTime = toZonedTime(new Date(), tz);
        const hour = localTime.getHours();
        const day = localTime.getDay(); // 0 is Sunday

        // 1. Daily Digest: run if digest_hour matches current hour
        if (owner.settings.daily_digest && hour === owner.settings.digest_hour) {
          logger.info({ hour, tz }, 'Triggering daily digest job');
          await runDailyDigest(bot, owner);
        }

        // 2. Weekly Digest: run Sunday (0) at 20:00 (8 PM)
        if (owner.settings.weekly_digest && day === 0 && hour === 20) {
          logger.info({ day, hour, tz }, 'Triggering weekly digest job');
          await runWeeklyDigest(bot, owner);
        }
      } catch (err) {
        logger.error({ err }, 'Hourly digest checks failed');
      }
    })();
  }, { timezone: 'UTC' });

  logger.info('All cron jobs registered successfully');
}


