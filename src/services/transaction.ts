import { getSupabase } from '../db/client';
import { CreateTransactionInput, Transaction, SummaryResult, CategorySummary } from '../types';
import { WalletService } from './wallet';
import { MAX_AMOUNT } from '../utils/constants';

export class TransactionService {
  static async create(data: CreateTransactionInput): Promise<Transaction> {
    // ─── Input Validation ─────────────────────────────────────────────────
    if (!data.amount || data.amount <= 0) {
      throw new Error('Amount must be a positive number.');
    }
    if (data.amount > MAX_AMOUNT) {
      throw new Error(`Amount cannot exceed ${MAX_AMOUNT.toLocaleString()}.`);
    }
    if (data.type === 'transfer' && data.wallet_id && data.wallet_id === data.to_wallet_id) {
      throw new Error('From and To wallet must be different.');
    }

    // For Milestone 1.2, amount_base is just amount (multi-currency in 1.9)
    const amount_base = data.amount;

    const { data: result, error } = await getSupabase()
      .from('transactions')
      .insert({
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        amount_base: amount_base,
        wallet_id: data.wallet_id || null,
        to_wallet_id: data.to_wallet_id || null,
        category_id: data.category_id || null,
        description: data.description,
        date: data.date,
        source: data.source || 'manual',
        recurring_id: data.recurring_id,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) throw error;

    // Adjust Wallet balances
    if (data.wallet_id) {
      if (data.type === 'income') {
        await WalletService.adjustBalance(data.wallet_id, data.amount);
      } else if (data.type === 'expense') {
        await WalletService.adjustBalance(data.wallet_id, -data.amount);
      } else if (data.type === 'transfer' && data.to_wallet_id) {
        await WalletService.adjustBalance(data.wallet_id, -data.amount);
        await WalletService.adjustBalance(data.to_wallet_id, data.amount);
      }
    }

    return result as Transaction;
  }

  static async update(id: string, data: Partial<CreateTransactionInput>): Promise<Transaction> {
    // 1. Fetch original transaction to reverse its balance effects
    const { data: original, error: fetchError } = await getSupabase()
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !original) {
      throw new Error('Transaction not found');
    }

    // 2. Reverse old wallet adjustments
    if (original.wallet_id) {
      if (original.type === 'income') {
        await WalletService.adjustBalance(original.wallet_id, -original.amount);
      } else if (original.type === 'expense' || original.type === 'transfer') {
        await WalletService.adjustBalance(original.wallet_id, original.amount);
      }
    }
    if (original.to_wallet_id && original.type === 'transfer') {
      await WalletService.adjustBalance(original.to_wallet_id, -original.amount);
    }

    // 3. Perform the update
    const updateData: any = { ...data };
    if (data.amount !== undefined) {
      updateData.amount_base = data.amount;
    }

    const { data: result, error } = await getSupabase()
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Revert reversal on DB error
      if (original.wallet_id) {
        if (original.type === 'income') {
          await WalletService.adjustBalance(original.wallet_id, original.amount);
        } else if (original.type === 'expense' || original.type === 'transfer') {
          await WalletService.adjustBalance(original.wallet_id, -original.amount);
        }
      }
      if (original.to_wallet_id && original.type === 'transfer') {
        await WalletService.adjustBalance(original.to_wallet_id, original.amount);
      }
      throw error;
    }

    // 4. Apply new wallet adjustments
    const updated = result as Transaction;
    if (updated.wallet_id) {
      if (updated.type === 'income') {
        await WalletService.adjustBalance(updated.wallet_id, updated.amount);
      } else if (updated.type === 'expense' || updated.type === 'transfer') {
        await WalletService.adjustBalance(updated.wallet_id, -updated.amount);
      }
    }
    if (updated.to_wallet_id && updated.type === 'transfer') {
      await WalletService.adjustBalance(updated.to_wallet_id, updated.amount);
    }

    return updated as Transaction;
  }

  static async delete(id: string): Promise<void> {
    // TRD supports deleting by short ID
    // So we search for id starting with the provided string
    const { data, error: fetchError } = await getSupabase()
      .from('transactions')
      .select('*')
      .ilike('id', `${id}%`)
      .limit(1)
      .single();

    if (fetchError || !data) {
      throw new Error('Transaction not found');
    }

    // Reverse Wallet balances before deleting
    if (data.wallet_id) {
      if (data.type === 'income') {
        await WalletService.adjustBalance(data.wallet_id, -data.amount);
      } else if (data.type === 'expense') {
        await WalletService.adjustBalance(data.wallet_id, data.amount);
      } else if (data.type === 'transfer' && data.to_wallet_id) {
        await WalletService.adjustBalance(data.wallet_id, data.amount);
        await WalletService.adjustBalance(data.to_wallet_id, -data.amount);
      }
    }

    const { error } = await getSupabase()
      .from('transactions')
      .delete()
      .eq('id', data.id);

    if (error) throw error;
  }

  static async getHistory(limit: number, offset: number = 0): Promise<(Transaction & { category: { name: string, icon: string } | null, wallet: { name: string, icon: string } | null })[]> {
    const { data, error } = await getSupabase()
      .from('transactions')
      .select('*, category:categories(name, icon), wallet:wallets!wallet_id(name, icon)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data as any[];
  }

  static async getLastOne(): Promise<Transaction | null> {
    const { data, error } = await getSupabase()
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data as Transaction;
  }

  /**
   * Get summary for a given period: today, week, month, or specific month.
   */
  static async getSummary(period: 'today' | 'week' | 'month', date?: string): Promise<SummaryResult> {
    const now = date ? new Date(date) : new Date();
    let from: string;
    let to: string;

    if (period === 'today') {
      const { format } = await import('date-fns');
      from = format(now, 'yyyy-MM-dd');
      to = from;
    } else if (period === 'week') {
      const { startOfWeek, endOfWeek, format } = await import('date-fns');
      from = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      to = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    } else {
      const { startOfMonth, endOfMonth, format } = await import('date-fns');
      from = format(startOfMonth(now), 'yyyy-MM-dd');
      to = format(endOfMonth(now), 'yyyy-MM-dd');
    }

    const txs = await this.getByDateRange(from, to);

    let total_income = 0;
    let total_expense = 0;
    const catMap: Record<string, { total: number; txn_count: number; category_id: string }> = {};

    for (const tx of txs) {
      if (tx.type === 'income') total_income += Number(tx.amount_base);
      if (tx.type === 'expense') {
        total_expense += Number(tx.amount_base);
        const cid = tx.category_id || 'uncategorized';
        if (!catMap[cid]) catMap[cid] = { total: 0, txn_count: 0, category_id: cid };
        catMap[cid].total += Number(tx.amount_base);
        catMap[cid].txn_count += 1;
      }
    }

    const by_category: CategorySummary[] = Object.values(catMap)
      .sort((a, b) => b.total - a.total)
      .map(c => ({
        category_id: c.category_id,
        category_name: '',  // caller can enrich
        icon: '',
        total: c.total,
        txn_count: c.txn_count,
        percentage: total_expense > 0 ? (c.total / total_expense) * 100 : 0,
      }));

    return {
      period: `${from} to ${to}`,
      total_income,
      total_expense,
      net: total_income - total_expense,
      by_category,
    };
  }

  /**
   * Get transactions within a date range.
   */
  static async getByDateRange(from: string, to: string): Promise<Transaction[]> {
    const { data, error } = await getSupabase()
      .from('transactions')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });

    if (error) throw error;
    return data as Transaction[];
  }

  /**
   * Get transactions for a specific month (YYYY-MM format).
   */
  static async getByMonth(yearMonth: string): Promise<Transaction[]> {
    const [year, month] = yearMonth.split('-').map(Number);
    const { startOfMonth, endOfMonth, format } = await import('date-fns');
    const d = new Date(year, month - 1, 1);
    const from = format(startOfMonth(d), 'yyyy-MM-dd');
    const to = format(endOfMonth(d), 'yyyy-MM-dd');
    return this.getByDateRange(from, to);
  }

  /**
   * Get transactions for a specific wallet.
   */
  static async getByWallet(walletId: string, limit: number = 50): Promise<Transaction[]> {
    const { data, error } = await getSupabase()
      .from('transactions')
      .select('*')
      .or(`wallet_id.eq.${walletId},to_wallet_id.eq.${walletId}`)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as Transaction[];
  }
}
