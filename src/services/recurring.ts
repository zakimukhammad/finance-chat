import { Telegraf, Markup } from 'telegraf';
import { addDays, addWeeks, addMonths, addYears, parseISO, format } from 'date-fns';
import { getSupabase } from '../db/client';
import { RecurringTransaction, CreateRecurringInput } from '../types';
import { logger } from '../utils/logger';
import { OwnerService } from './owner';
import { TransactionService } from './transaction';
import { formatCurrency, formatDateShort } from '../utils/formatters';

export class RecurringService {
  /**
   * Add a new recurring transaction configuration.
   */
  static async add(data: CreateRecurringInput): Promise<RecurringTransaction> {
    const { data: result, error } = await getSupabase()
      .from('recurring_transactions')
      .insert({
        description: data.description,
        amount: data.amount,
        type: data.type,
        category_id: data.category_id || null,
        wallet_id: data.wallet_id || null,
        to_wallet_id: data.to_wallet_id || null,
        frequency: data.frequency,
        next_due_date: data.next_due_date,
        active: true
      })
      .select()
      .single();

    if (error) throw error;
    return result as RecurringTransaction;
  }

  /**
   * List all recurring transactions ordered by created_at.
   */
  static async list(): Promise<(RecurringTransaction & {
    category: { name: string; icon: string } | null;
    wallet: { name: string; icon: string } | null;
    to_wallet: { name: string; icon: string } | null;
  })[]> {
    const { data, error } = await getSupabase()
      .from('recurring_transactions')
      .select('*, category:categories(name, icon), wallet:wallets!wallet_id(name, icon), to_wallet:wallets!to_wallet_id(name, icon)')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data as any[];
  }

  /**
   * Fetch a recurring transaction by ID or short ID prefix match.
   */
  static async getById(id: string): Promise<RecurringTransaction & {
    category: { name: string; icon: string } | null;
    wallet: { name: string; icon: string } | null;
    to_wallet: { name: string; icon: string } | null;
  }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let data;

    if (isUuid) {
      const { data: entry, error } = await getSupabase()
        .from('recurring_transactions')
        .select('*, category:categories(name, icon), wallet:wallets!wallet_id(name, icon), to_wallet:wallets!to_wallet_id(name, icon)')
        .eq('id', id)
        .single();
      
      if (!error && entry) {
        data = entry;
      }
    } else {
      const { data: entries, error } = await getSupabase()
        .from('recurring_transactions')
        .select('*, category:categories(name, icon), wallet:wallets!wallet_id(name, icon), to_wallet:wallets!to_wallet_id(name, icon)')
        .order('created_at', { ascending: true });
      
      if (!error && entries) {
        data = entries.find(item => item.id.replace(/-/g, '').startsWith(id.toLowerCase()));
      }
    }

    if (!data) {
      throw new Error('Recurring entry not found');
    }

    return data as any;
  }

  /**
   * Delete a recurring transaction configuration by ID.
   */
  static async delete(id: string): Promise<void> {
    const entry = await this.getById(id);
    const { error } = await getSupabase()
      .from('recurring_transactions')
      .delete()
      .eq('id', entry.id);

    if (error) throw error;
  }

  /**
   * Toggle the pause state of a recurring transaction.
   */
  static async togglePause(id: string): Promise<RecurringTransaction & {
    category: { name: string; icon: string } | null;
    wallet: { name: string; icon: string } | null;
    to_wallet: { name: string; icon: string } | null;
  }> {
    const entry = await this.getById(id);
    const { data, error } = await getSupabase()
      .from('recurring_transactions')
      .update({ active: !entry.active })
      .eq('id', entry.id)
      .select('*, category:categories(name, icon), wallet:wallets!wallet_id(name, icon), to_wallet:wallets!to_wallet_id(name, icon)')
      .single();

    if (error) throw error;
    return data as any;
  }

  /**
   * Scan for and process due recurring transactions.
   * Auto-logs the transactions, advances their next due date, and sends Telegram push alerts.
   */
  static async processDue(bot: Telegraf): Promise<void> {
    const ownerIdStr = process.env.OWNER_TELEGRAM_ID;
    if (!ownerIdStr) return;
    const telegramId = parseInt(ownerIdStr, 10);

    const owner = await OwnerService.getOwner(telegramId);
    if (!owner) return;

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch active recurring configurations whose next_due_date is today or in the past
    const { data: entries, error } = await getSupabase()
      .from('recurring_transactions')
      .select('*, category:categories(name, icon), wallet:wallets!wallet_id(name, icon), to_wallet:wallets!to_wallet_id(name, icon)')
      .eq('active', true)
      .lte('next_due_date', todayStr);

    if (error || !entries || entries.length === 0) {
      logger.info('No recurring entries due for processing');
      return;
    }

    logger.info(`Processing ${entries.length} due recurring transactions`);

    for (const entry of entries) {
      try {
        // 2. Create the actual transaction
        const txn = await TransactionService.create({
          type: entry.type,
          amount: Number(entry.amount),
          currency: owner.currency,
          wallet_id: entry.wallet_id,
          to_wallet_id: entry.to_wallet_id,
          category_id: entry.category_id,
          description: entry.description,
          date: todayStr,
          source: 'recurring',
          recurring_id: entry.id
        });

        // 3. Advance next_due_date by frequency
        const currentDueDate = parseISO(entry.next_due_date);
        let nextDueDate: Date;

        switch (entry.frequency) {
          case 'daily':
            nextDueDate = addDays(currentDueDate, 1);
            break;
          case 'weekly':
            nextDueDate = addWeeks(currentDueDate, 1);
            break;
          case 'monthly':
            nextDueDate = addMonths(currentDueDate, 1);
            break;
          case 'yearly':
            nextDueDate = addYears(currentDueDate, 1);
            break;
          default:
            nextDueDate = addDays(currentDueDate, 1);
        }

        const nextDueDateStr = format(nextDueDate, 'yyyy-MM-dd');

        await getSupabase()
          .from('recurring_transactions')
          .update({ next_due_date: nextDueDateStr })
          .eq('id', entry.id);

        // 4. Construct and send Telegram push message
        let walletLine = '';
        if (entry.type === 'transfer' && entry.wallet && entry.to_wallet) {
          walletLine = `💳 *Wallet*: ${entry.wallet.icon} ${entry.wallet.name} ➡️ ${entry.to_wallet.icon} ${entry.to_wallet.name}`;
        } else if (entry.wallet) {
          walletLine = `💳 *Wallet*: ${entry.wallet.icon} ${entry.wallet.name}`;
        }

        const formattedAmount = formatCurrency(Number(entry.amount), owner.currency);
        const categoryStr = entry.category ? ` — ${entry.category.icon} ${entry.category.name}` : '';

        const msgText = `🔄 *Recurring entry processed!*\n` +
          `*${entry.description}*${categoryStr}\n` +
          `💰 *Amount*: ${formattedAmount}\n` +
          `${walletLine ? walletLine + '\n' : ''}` +
          `📅 *Auto-logged for*: ${formatDateShort(todayStr)}`;

        const keyboard = Markup.inlineKeyboard([
          Markup.button.callback('✅ OK', `recdue_ok:${txn.id}`),
          Markup.button.callback('✏️ Edit amount', `recdue_edit:${txn.id}`),
          Markup.button.callback('⏸️ Pause', `recdue_pause:${entry.id}`)
        ]);

        await bot.telegram.sendMessage(telegramId, msgText, {
          parse_mode: 'Markdown',
          ...keyboard
        });

        logger.info({ entryId: entry.id, txnId: txn.id }, 'Successfully auto-logged and advanced recurring entry');
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Failed to process recurring entry');
      }
    }
  }
}
