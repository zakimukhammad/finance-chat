import { Telegraf } from 'telegraf';
import { differenceInDays, parseISO } from 'date-fns';
import { getSupabase } from '../db/client';
import { getRedis } from '../db/redis';
import { SavingsGoal } from '../types';
import { logger } from '../utils/logger';
import { OwnerService } from './owner';
import { formatCurrency } from '../utils/formatters';

export class GoalService {
  /**
   * Create a new savings goal.
   */
  static async create(
    name: string,
    target: number,
    walletId?: string | null,
    deadline?: string | null
  ): Promise<SavingsGoal> {
    const { data, error } = await getSupabase()
      .from('savings_goals')
      .insert({
        name,
        target_amount: target,
        current_amount: 0,
        wallet_id: walletId || null,
        deadline: deadline || null,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    return data as SavingsGoal;
  }

  /**
   * List all savings goals ordered by created_at.
   */
  static async list(): Promise<SavingsGoal[]> {
    const { data, error } = await getSupabase()
      .from('savings_goals')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data as SavingsGoal[];
  }

  /**
   * Update goal details.
   */
  static async update(
    idOrName: string,
    updateData: Partial<SavingsGoal>
  ): Promise<SavingsGoal> {
    const goal = await this.getByNameOrId(idOrName);
    if (!goal) {
      throw new Error(`Goal "${idOrName}" not found.`);
    }

    const { data, error } = await getSupabase()
      .from('savings_goals')
      .update(updateData)
      .eq('id', goal.id)
      .select()
      .single();

    if (error) throw error;
    return data as SavingsGoal;
  }

  /**
   * Delete a goal.
   */
  static async delete(idOrName: string): Promise<void> {
    const goal = await this.getByNameOrId(idOrName);
    if (!goal) {
      throw new Error(`Goal "${idOrName}" not found.`);
    }

    const { error } = await getSupabase()
      .from('savings_goals')
      .delete()
      .eq('id', goal.id);

    if (error) throw error;
  }

  /**
   * Contribute funds to a goal. If it reaches or exceeds target, sets status to completed.
   */
  static async contribute(idOrName: string, amount: number): Promise<SavingsGoal> {
    const goal = await this.getByNameOrId(idOrName);
    if (!goal) {
      throw new Error(`Goal "${idOrName}" not found.`);
    }

    const newAmount = Number(goal.current_amount) + amount;
    const targetAmount = Number(goal.target_amount);
    const isCompleted = newAmount >= targetAmount;

    const updateFields: Partial<SavingsGoal> = {
      current_amount: newAmount
    };

    if (isCompleted) {
      updateFields.status = 'completed';
    }

    const { data, error } = await getSupabase()
      .from('savings_goals')
      .update(updateFields)
      .eq('id', goal.id)
      .select()
      .single();

    if (error) throw error;
    return data as SavingsGoal;
  }

  /**
   * Helper to retrieve a goal by ID (UUID format) or case-insensitive name match.
   */
  static async getByNameOrId(idOrName: string): Promise<SavingsGoal | null> {
    // 1. Try UUID lookup
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(idOrName)) {
      const { data } = await getSupabase()
        .from('savings_goals')
        .select('*')
        .eq('id', idOrName)
        .limit(1)
        .maybeSingle();

      if (data) return data as SavingsGoal;
    }

    // 2. Fetch all goals and find by exact/fuzzy match
    const { data: goals, error } = await getSupabase()
      .from('savings_goals')
      .select('*');

    if (error || !goals) return null;

    const lowerIdOrName = idOrName.toLowerCase().trim();

    // 2.1 Exact case-insensitive match
    const exactMatch = goals.find(g => g.name.toLowerCase() === lowerIdOrName);
    if (exactMatch) return exactMatch as SavingsGoal;

    // 2.2 Substring match
    const subMatch = goals.find(g => g.name.toLowerCase().includes(lowerIdOrName));
    if (subMatch) return subMatch as SavingsGoal;

    return null;
  }

  /**
   * Scan active goals for deadline reminders.
   * Runs daily. Finds deadlines in exactly 7 days or 1 day.
   * Prevents duplicates using Upstash Redis.
   */
  static async sendDeadlineReminders(bot: Telegraf): Promise<void> {
    const ownerIdStr = process.env.OWNER_TELEGRAM_ID;
    if (!ownerIdStr) return;
    const telegramId = parseInt(ownerIdStr, 10);

    const owner = await OwnerService.getOwner(telegramId);
    if (!owner) return;

    const { data: goals, error } = await getSupabase()
      .from('savings_goals')
      .select('*')
      .eq('status', 'active')
      .not('deadline', 'is', null);

    if (error || !goals || goals.length === 0) return;

    const redis = getRedis();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    for (const goal of goals) {
      const deadlineDate = parseISO(goal.deadline!);
      const daysLeft = differenceInDays(deadlineDate, today);

      if (daysLeft === 7 || daysLeft === 1) {
        const redisKey = `goal_reminded:${goal.id}:${todayStr}`;
        const alreadyReminded = await redis.get(redisKey);
        if (alreadyReminded) {
          logger.info({ goalId: goal.id, daysLeft }, 'Goal reminder already sent for today, skipping');
          continue;
        }

        const formattedTarget = formatCurrency(Number(goal.target_amount), owner.currency);
        const formattedSaved = formatCurrency(Number(goal.current_amount), owner.currency);

        const msgText = daysLeft === 7
          ? `⏳ *Savings Goal Reminder — ${goal.name}*\n\n` +
            `You have *7 days left* to reach your target!\n` +
            `🎯 *Target*: ${formattedTarget}\n` +
            `💰 *Saved*:  ${formattedSaved}`
          : `⚠️ *Savings Goal Reminder — ${goal.name}*\n\n` +
            `Deadline is *tomorrow*!\n` +
            `🎯 *Target*: ${formattedTarget}\n` +
            `💰 *Saved*:  ${formattedSaved}`;

        try {
          await bot.telegram.sendMessage(telegramId, msgText, { parse_mode: 'Markdown' });
          await redis.set(redisKey, '1', 'EX', 25 * 60 * 60);
          logger.info({ goalId: goal.id, daysLeft }, 'Sent goal deadline reminder');
        } catch (err) {
          logger.error({ err, goalId: goal.id }, 'Failed to send goal deadline reminder');
        }
      }
    }
  }
}
