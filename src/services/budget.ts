import { Context, Telegraf } from 'telegraf';
import { getSupabase } from '../db/client';
import { Budget, BudgetStatusRow, BudgetPeriod } from '../types';
import { logger } from '../utils/logger';
import { formatCurrency, progressBar, formatPercent } from '../utils/formatters';
import { OwnerService } from './owner';
import { formatISO } from 'date-fns';

export class BudgetService {
  /**
   * Set or update a budget for a category.
   */
  static async set(categoryId: string, amount: number, period: BudgetPeriod = 'monthly'): Promise<Budget> {
    const { data, error } = await getSupabase()
      .from('budgets')
      .upsert(
        { category_id: categoryId, amount, period, alert_threshold: 80 },
        { onConflict: 'category_id,period' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as Budget;
  }

  /**
   * Delete a budget for a category.
   */
  static async delete(categoryId: string): Promise<void> {
    const { error } = await getSupabase()
      .from('budgets')
      .delete()
      .eq('category_id', categoryId);

    if (error) throw error;
  }

  /**
   * Get current status of all budgets using the budget_status view.
   */
  static async getStatus(): Promise<BudgetStatusRow[]> {
    const { data, error } = await getSupabase()
      .from('budget_status')
      .select('*')
      .order('pct_used', { ascending: false });

    if (error) throw error;
    return data as BudgetStatusRow[];
  }

  /**
   * Get the budget status for a specific category.
   */
  static async getCategoryStatus(categoryId: string): Promise<BudgetStatusRow | null> {
    const { data, error } = await getSupabase()
      .from('budget_status')
      .select('*')
      .eq('category_id', categoryId)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found (no budget set)
      throw error;
    }
    return data as BudgetStatusRow;
  }

  /**
   * Helper to format an inline budget string for transaction confirmations.
   */
  static async formatInlineStatus(categoryId: string, currency: string): Promise<string> {
    const status = await this.getCategoryStatus(categoryId);
    if (!status) return '';
    return `\n\n📊 *Budget*: ${progressBar(status.pct_used, 8)} ${formatPercent(status.pct_used)}\n` +
           `   ${formatCurrency(status.spent, currency)} / ${formatCurrency(status.budget_amount, currency)}`;
  }

  /**
   * Reset the budget alert flags. Should be called on the 1st of every month.
   */
  static async resetAlertFlags(): Promise<void> {
    const { error } = await getSupabase()
      .from('budgets')
      .update({ alerted_80_at: null, alerted_100_at: null })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // update all

    if (error) throw error;
    logger.info('Reset all budget alert flags');
  }

  /**
   * Check all budgets and send an alert via Telegram if they cross 80% or 100%.
   */
  static async checkAndAlert(bot: Telegraf): Promise<void> {
    logger.info('Running checkAndAlert cron');
    const ownerIdStr = process.env.OWNER_TELEGRAM_ID;
    if (!ownerIdStr) return;
    const telegramId = parseInt(ownerIdStr, 10);
    const owner = await OwnerService.getOwner(telegramId);
    if (!owner) return;

    const statuses = await this.getStatus();
    const now = formatISO(new Date());

    for (const status of statuses) {
      const isOver100 = status.pct_used >= 100;
      const isOver80 = status.pct_used >= status.alert_threshold && status.pct_used < 100;

      let shouldAlert = false;
      let alertType: '100' | '80' | null = null;

      if (isOver100 && !status.alerted_100_at) {
        shouldAlert = true;
        alertType = '100';
      } else if (isOver80 && !status.alerted_80_at) {
        shouldAlert = true;
        alertType = '80';
      }

      if (shouldAlert) {
        const remaining = Math.max(0, status.budget_amount - status.spent);
        
        const message = 
          `⚠️ *Budget Alert — ${status.icon} ${status.category_name}*\n\n` +
          `You've reached *${formatPercent(status.pct_used)}* of your ${status.period} budget!\n\n` +
          `💸 *Spent*:     ${formatCurrency(status.spent, owner.currency)}\n` +
          `🎯 *Budget*:    ${formatCurrency(status.budget_amount, owner.currency)}\n` +
          `📉 *Remaining*: ${formatCurrency(remaining, owner.currency)}\n\n` +
          `${progressBar(status.pct_used, 15)}`;

        try {
          await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
          logger.info({ categoryId: status.category_id, type: alertType }, 'Sent budget alert');

          // Update the database to prevent duplicate alerts
          const updateData: any = {};
          if (alertType === '100') updateData.alerted_100_at = now;
          if (alertType === '80') updateData.alerted_80_at = now;

          await getSupabase()
            .from('budgets')
            .update(updateData)
            .eq('id', status.id);

        } catch (err) {
          logger.error({ err, categoryId: status.category_id }, 'Failed to send budget alert');
        }
      }
    }
  }
}
