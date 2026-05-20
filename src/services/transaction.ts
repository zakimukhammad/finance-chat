import { getSupabase } from '../db/client';
import { CreateTransactionInput, Transaction } from '../types';
import { WalletService } from './wallet';

export class TransactionService {
  static async create(data: CreateTransactionInput): Promise<Transaction> {
    // For Milestone 1.2, amount_base is just amount (multi-currency in 1.8)
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
      .select('*, category:categories(name, icon), wallet:wallets(name, icon)')
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
}
