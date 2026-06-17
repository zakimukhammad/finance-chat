import { Telegraf, Markup } from 'telegraf';
import { getSupabase } from '../db/client';
import { getRedis } from '../db/redis';
import { logger } from '../utils/logger';
import { OwnerService } from './owner';
import { TransactionService } from './transaction';
import { BudgetService } from './budget';
import { GoalService } from './goal';
import { formatCurrency, progressBar, formatPercent } from '../utils/formatters';
import {
  startOfMonth, endOfMonth, subMonths, format, differenceInDays,
  getDaysInMonth, parseISO, subDays
} from 'date-fns';

/**
 * NudgeService — Phase 2 Milestone 2.1
 * 
 * Proactive bot-initiated suggestions that run daily via cron.
 * Each nudge uses Redis dedup to avoid spamming the owner.
 * 
 * 5 nudge types:
 * 1. Recurring suggestion — same merchant 3+ times/month
 * 2. Budget suggestion — top expense category 2 months in a row, no budget
 * 3. Goal contribution reminder — no contribution in 14 days
 * 4. End-of-month under-budget tip — ≤ 3 days left, under budget
 * 5. Monthly spend spike alert — category > 30% above prior month
 */
export class NudgeService {

  /**
   * Run all nudge checks. Called by cron daily.
   * Each check is wrapped in try/catch so one failure doesn't block others.
   */
  static async runAll(bot: Telegraf): Promise<void> {
    logger.info('Running all smart nudge checks');

    const ownerIdStr = process.env.OWNER_TELEGRAM_ID;
    if (!ownerIdStr) return;
    const telegramId = parseInt(ownerIdStr, 10);

    const owner = await OwnerService.getOwner(telegramId);
    if (!owner) return;

    const checks = [
      () => this.checkRecurringSuggestion(bot, telegramId, owner.currency),
      () => this.checkBudgetSuggestion(bot, telegramId, owner.currency),
      () => this.checkGoalContributions(bot, telegramId, owner.currency),
      () => this.checkEndOfMonthTip(bot, telegramId, owner.currency),
      () => this.checkSpendSpikeAlert(bot, telegramId, owner.currency),
    ];

    for (const check of checks) {
      try {
        await check();
      } catch (err) {
        logger.error({ err }, 'Smart nudge check failed');
      }
    }

    logger.info('Smart nudge checks completed');
  }

  // ─── 1. Recurring Suggestion ──────────────────────────────────────────────
  // If the same description appears 3+ times this month, suggest making it recurring.

  static async checkRecurringSuggestion(
    bot: Telegraf,
    telegramId: number,
    ownerCurrency: string
  ): Promise<void> {
    const now = new Date();
    const from = format(startOfMonth(now), 'yyyy-MM-dd');
    const to = format(endOfMonth(now), 'yyyy-MM-dd');

    const txs = await TransactionService.getByDateRange(from, to);
    if (txs.length === 0) return;

    // Group by normalized description (lowercase, trimmed)
    const descCounts: Record<string, { count: number; amount: number; description: string }> = {};
    for (const tx of txs) {
      if (!tx.description || tx.source === 'recurring') continue;
      const key = tx.description.trim().toLowerCase();
      if (!descCounts[key]) {
        descCounts[key] = { count: 0, amount: Number(tx.amount), description: tx.description };
      }
      descCounts[key].count++;
    }

    // Check existing recurring entries to avoid suggesting already-recurring ones
    const { data: existingRecurring } = await getSupabase()
      .from('recurring_transactions')
      .select('description')
      .eq('active', true);

    const existingDescs = new Set(
      (existingRecurring || []).map(r => r.description.trim().toLowerCase())
    );

    const redis = getRedis();
    const todayStr = format(now, 'yyyy-MM-dd');

    for (const [key, info] of Object.entries(descCounts)) {
      if (info.count < 3) continue;
      if (existingDescs.has(key)) continue;

      // Redis dedup: once per month per description
      const redisKey = `nudge:recurring:${key}:${format(now, 'yyyy-MM')}`;
      const alreadySent = await redis.get(redisKey);
      if (alreadySent) continue;

      const msg =
        `💡 *Tips Pintar — Transaksi Rutin*\n\n` +
        `Saya melihat Anda telah mencatat "*${info.description}*" sebanyak ${info.count} kali bulan ini.\n` +
        `Apakah Anda ingin menjadikannya transaksi rutin agar tercatat secara otomatis?\n\n` +
        `💰 Jumlah: ${formatCurrency(info.amount, ownerCurrency)}`;

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('✅ Jadikan Rutin', `nudge_rec_yes:${encodeURIComponent(info.description)}:${info.amount}`),
        Markup.button.callback('❌ Abaikan', `nudge_dismiss`),
      ]);

      try {
        await bot.telegram.sendMessage(telegramId, msg, {
          parse_mode: 'Markdown',
          ...keyboard,
        });
        await redis.set(redisKey, '1', 'EX', 30 * 24 * 60 * 60); // 30 days
        logger.info({ description: info.description, count: info.count }, 'Sent recurring suggestion nudge');
      } catch (err) {
        logger.error({ err, description: info.description }, 'Failed to send recurring suggestion nudge');
      }
    }
  }

  /**
   * Inline version: check if a specific description has hit 3+ this month.
   * Returns the nudge text to append to confirmation card, or null.
   */
  static async checkRecurringSuggestionInline(description: string, amount: number, ownerCurrency: string): Promise<string | null> {
    if (!description) return null;

    const now = new Date();
    const from = format(startOfMonth(now), 'yyyy-MM-dd');
    const to = format(endOfMonth(now), 'yyyy-MM-dd');

    const txs = await TransactionService.getByDateRange(from, to);
    const key = description.trim().toLowerCase();
    const count = txs.filter(tx => tx.description?.trim().toLowerCase() === key && tx.source !== 'recurring').length;

    if (count < 3) return null;

    // Check if already a recurring entry
    const { data: existingRecurring } = await getSupabase()
      .from('recurring_transactions')
      .select('description')
      .eq('active', true);

    const existingDescs = new Set(
      (existingRecurring || []).map(r => r.description.trim().toLowerCase())
    );

    if (existingDescs.has(key)) return null;

    // Redis dedup
    const redis = getRedis();
    const redisKey = `nudge:recurring:${key}:${format(now, 'yyyy-MM')}`;
    const alreadySent = await redis.get(redisKey);
    if (alreadySent) return null;

    await redis.set(redisKey, '1', 'EX', 30 * 24 * 60 * 60);

    return `\n\n💡 _Anda telah mencatat "${description}" sebanyak ${count} kali bulan ini. Jadikan rutin?_`;
  }

  // ─── 2. Budget Suggestion ─────────────────────────────────────────────────
  // If a category is the top expense 2 months in a row and has no budget, suggest one.

  static async checkBudgetSuggestion(
    bot: Telegraf,
    telegramId: number,
    ownerCurrency: string
  ): Promise<void> {
    const now = new Date();

    // Get top expense category for current month
    const currentSummary = await TransactionService.getSummary('month');
    if (currentSummary.by_category.length === 0) return;
    const topCurrent = currentSummary.by_category[0];

    // Get top expense category for prior month
    const priorMonthDate = subMonths(now, 1);
    const priorSummary = await TransactionService.getSummary('month', priorMonthDate.toISOString());
    if (priorSummary.by_category.length === 0) return;
    const topPrior = priorSummary.by_category[0];

    // Must be the same category both months
    if (topCurrent.category_id !== topPrior.category_id) return;
    if (topCurrent.category_id === 'uncategorized') return;

    // Check if this category already has a budget
    const budgetStatus = await BudgetService.getCategoryStatus(topCurrent.category_id);
    if (budgetStatus) return; // Already has a budget

    // Fetch category name
    const { data: category } = await getSupabase()
      .from('categories')
      .select('name, icon')
      .eq('id', topCurrent.category_id)
      .single();

    if (!category) return;

    // Redis dedup: once per month
    const redis = getRedis();
    const redisKey = `nudge:budget:${topCurrent.category_id}:${format(now, 'yyyy-MM')}`;
    const alreadySent = await redis.get(redisKey);
    if (alreadySent) return;

    const suggestedBudget = Math.ceil(topCurrent.total * 1.1 / 1000) * 1000; // 10% above, rounded to nearest 1000

    const msg =
      `💡 *Tips Pintar — Saran Anggaran*\n\n` +
      `${category.icon} *${category.name}* telah menjadi pengeluaran terbesar Anda selama 2 bulan berturut-turut.\n\n` +
      `Bulan ini: ${formatCurrency(topCurrent.total, ownerCurrency)}\n` +
      `Bulan lalu: ${formatCurrency(topPrior.total, ownerCurrency)}\n\n` +
      `Apakah Anda ingin menetapkan anggaran untuk mengontrolnya?`;

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback(`✅ Atur ${formatCurrency(suggestedBudget, ownerCurrency)}`, `nudge_budget_yes:${topCurrent.category_id}:${suggestedBudget}`),
      Markup.button.callback('❌ Tidak, terima kasih', `nudge_dismiss`),
    ]);

    try {
      await bot.telegram.sendMessage(telegramId, msg, {
        parse_mode: 'Markdown',
        ...keyboard,
      });
      await redis.set(redisKey, '1', 'EX', 30 * 24 * 60 * 60);
      logger.info({ categoryId: topCurrent.category_id }, 'Sent budget suggestion nudge');
    } catch (err) {
      logger.error({ err, categoryId: topCurrent.category_id }, 'Failed to send budget suggestion nudge');
    }
  }

  // ─── 3. Goal Contribution Reminder ────────────────────────────────────────
  // If an active goal hasn't received a contribution in 14 days, nudge.

  static async checkGoalContributions(
    bot: Telegraf,
    telegramId: number,
    ownerCurrency: string
  ): Promise<void> {
    const goals = await GoalService.list();
    const activeGoals = goals.filter(g => g.status === 'active');
    if (activeGoals.length === 0) return;

    const redis = getRedis();
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    for (const goal of activeGoals) {
      // Determine last activity: use the goal's updated_at or created_at
      // Since savings_goals doesn't track updated_at, we query for the most recent
      // goal-related note. We'll use created_at as the baseline and check if 14 days passed.
      // A more precise approach: check if any contribution was made via the goal command.
      // For simplicity, we'll check the goal's created_at and the time since last contribution
      // by looking at the current_amount progression — but we don't store that history.
      // Best approach: check the Supabase updated_at if available, or use a Redis key.

      const lastActivityKey = `goal_last_activity:${goal.id}`;
      let lastActivityStr = await redis.get(lastActivityKey);

      // If no Redis key, use created_at as baseline and set it
      if (!lastActivityStr) {
        lastActivityStr = goal.created_at.split('T')[0];
        // Don't set TTL — this persists until next contribution
        await redis.set(lastActivityKey, lastActivityStr);
      }

      const lastActivity = parseISO(lastActivityStr);
      const daysSinceLast = differenceInDays(now, lastActivity);

      if (daysSinceLast < 14) continue;

      // Redis dedup: only remind once per 14-day period
      const redisDedup = `nudge:goal_contrib:${goal.id}:${todayStr}`;
      const alreadySent = await redis.get(redisDedup);
      if (alreadySent) continue;

      const remaining = Number(goal.target_amount) - Number(goal.current_amount);
      const pct = Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100);

      const msg =
        `💡 *Tips Pintar — Pengingat Target Tabungan*\n\n` +
        `Anda belum menambah tabungan untuk target *${goal.name}* selama ${daysSinceLast} hari.\n\n` +
        `${progressBar(pct)} ${formatPercent(pct)}\n` +
        `💰 ${formatCurrency(Number(goal.current_amount), ownerCurrency)} / ${formatCurrency(Number(goal.target_amount), ownerCurrency)}\n` +
        `📉 Sisa: ${formatCurrency(remaining, ownerCurrency)}\n\n` +
        `Masih sesuai rencana? 🎯`;

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('➕ Tambah dana', `goal_contribute:${goal.id}`),
        Markup.button.callback('✅ Sesuai rencana', `nudge_dismiss`),
      ]);

      try {
        await bot.telegram.sendMessage(telegramId, msg, {
          parse_mode: 'Markdown',
          ...keyboard,
        });
        // Dedup for 14 days
        await redis.set(redisDedup, '1', 'EX', 14 * 24 * 60 * 60);
        logger.info({ goalId: goal.id, daysSinceLast }, 'Sent goal contribution reminder nudge');
      } catch (err) {
        logger.error({ err, goalId: goal.id }, 'Failed to send goal contribution nudge');
      }
    }
  }

  /**
   * Call this after a goal contribution to reset the last activity tracker.
   */
  static async markGoalActivity(goalId: string): Promise<void> {
    try {
      const redis = getRedis();
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      await redis.set(`goal_last_activity:${goalId}`, todayStr);
    } catch (err) {
      logger.warn({ err, goalId }, 'Failed to mark goal activity in Redis');
    }
  }

  // ─── 4. End-of-Month Under-Budget Tip ─────────────────────────────────────
  // If ≤ 3 days left in the month and a budget category is under 100%, celebrate!

  static async checkEndOfMonthTip(
    bot: Telegraf,
    telegramId: number,
    ownerCurrency: string
  ): Promise<void> {
    const now = new Date();
    const daysInMonth = getDaysInMonth(now);
    const currentDay = now.getDate();
    const daysLeft = daysInMonth - currentDay;

    if (daysLeft > 3) return; // Only fire in the last 3 days

    const budgetStatuses = await BudgetService.getStatus();
    if (budgetStatuses.length === 0) return;

    const redis = getRedis();
    const monthKey = format(now, 'yyyy-MM');

    // Find budgets that are under 100%
    const underBudget = budgetStatuses.filter(b => b.pct_used < 100);
    if (underBudget.length === 0) return;

    // Redis dedup: once per month for end-of-month tip
    const redisKey = `nudge:eom_tip:${monthKey}`;
    const alreadySent = await redis.get(redisKey);
    if (alreadySent) return;

    const lines = underBudget.slice(0, 3).map(b => {
      const remaining = Math.max(0, b.budget_amount - b.spent);
      return `${b.icon} ${b.category_name}: hemat ${formatCurrency(remaining, ownerCurrency)} di bawah anggaran`;
    });

    const daysText = daysLeft === 0 ? 'Hari terakhir' : `Tersisa ${daysLeft} hari`;

    const monthNamesIndonesian: Record<string, string> = {
      'January': 'Januari', 'February': 'Februari', 'March': 'Maret', 'April': 'April',
      'May': 'Mei', 'June': 'Juni', 'July': 'Juli', 'August': 'Agustus',
      'September': 'September', 'October': 'Oktober', 'November': 'November', 'December': 'Desember'
    };
    const monthEng = format(now, 'MMMM');
    const monthIndo = monthNamesIndonesian[monthEng] || monthEng;

    const msg =
      `🎉 *Tips Akhir Bulan*\n\n` +
      `${daysText} di bulan ${monthIndo} — pencapaian Anda luar biasa!\n\n` +
      lines.join('\n') +
      `\n\nPertahankan! 💪`;

    try {
      await bot.telegram.sendMessage(telegramId, msg, { parse_mode: 'Markdown' });
      await redis.set(redisKey, '1', 'EX', 5 * 24 * 60 * 60); // 5 days
      logger.info({ daysLeft, underBudgetCount: underBudget.length }, 'Sent end-of-month tip nudge');
    } catch (err) {
      logger.error({ err }, 'Failed to send end-of-month tip nudge');
    }
  }

  // ─── 5. Monthly Spend Spike Alert ─────────────────────────────────────────
  // If a category is > 30% higher than prior month, send proactive alert.

  static async checkSpendSpikeAlert(
    bot: Telegraf,
    telegramId: number,
    ownerCurrency: string
  ): Promise<void> {
    const now = new Date();

    const currentSummary = await TransactionService.getSummary('month');
    const priorMonthDate = subMonths(now, 1);
    const priorSummary = await TransactionService.getSummary('month', priorMonthDate.toISOString());

    if (currentSummary.by_category.length === 0 || priorSummary.by_category.length === 0) return;

    // Build a map of prior month category spending
    const priorMap: Record<string, number> = {};
    for (const cat of priorSummary.by_category) {
      priorMap[cat.category_id] = cat.total;
    }

    const redis = getRedis();
    const monthKey = format(now, 'yyyy-MM');

    for (const cat of currentSummary.by_category) {
      if (cat.category_id === 'uncategorized') continue;

      const priorTotal = priorMap[cat.category_id];
      if (!priorTotal || priorTotal === 0) continue;

      const pctIncrease = ((cat.total - priorTotal) / priorTotal) * 100;
      if (pctIncrease <= 30) continue;

      // Redis dedup: once per month per category
      const redisKey = `nudge:spike:${cat.category_id}:${monthKey}`;
      const alreadySent = await redis.get(redisKey);
      if (alreadySent) continue;

      // Fetch category info
      const { data: category } = await getSupabase()
        .from('categories')
        .select('name, icon')
        .eq('id', cat.category_id)
        .single();

      if (!category) continue;

      const msg =
        `📈 *Peringatan Lonjakan Pengeluaran*\n\n` +
        `${category.icon} *${category.name}* naik *${Math.round(pctIncrease)}%* dibanding bulan lalu!\n\n` +
        `Bulan ini: ${formatCurrency(cat.total, ownerCurrency)}\n` +
        `Bulan lalu: ${formatCurrency(priorTotal, ownerCurrency)}\n` +
        `Selisih: +${formatCurrency(cat.total - priorTotal, ownerCurrency)}\n\n` +
        `Perlu dipantau 👀`;

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('📊 Lihat Ringkasan', `insights_summary`),
        Markup.button.callback('✅ Mengerti', `nudge_dismiss`),
      ]);

      try {
        await bot.telegram.sendMessage(telegramId, msg, {
          parse_mode: 'Markdown',
          ...keyboard,
        });
        await redis.set(redisKey, '1', 'EX', 30 * 24 * 60 * 60);
        logger.info({ categoryId: cat.category_id, pctIncrease: Math.round(pctIncrease) }, 'Sent spend spike alert nudge');
      } catch (err) {
        logger.error({ err, categoryId: cat.category_id }, 'Failed to send spend spike alert nudge');
      }
    }
  }
}
