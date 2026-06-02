import { getSupabase } from '../db/client';
import { Wallet, WalletType } from '../types';
import { logger } from '../utils/logger';

export class WalletService {
  /**
   * Create a new wallet. If is_default is true, it clears the existing default wallet.
   */
  static async create(name: string, icon: string, type: WalletType, currency: string, balance: number = 0, isDefault: boolean = false): Promise<Wallet> {
    if (isDefault) {
      await this.clearDefault();
    }

    const { data, error } = await getSupabase()
      .from('wallets')
      .insert({
        name,
        icon,
        type,
        currency,
        balance,
        is_default: isDefault,
        sort_order: 0 // Simplification for now
      })
      .select()
      .single();

    if (error) throw error;
    return data as Wallet;
  }

  /**
   * List all wallets ordered by sort_order and name.
   */
  static async list(): Promise<Wallet[]> {
    const { data, error } = await getSupabase()
      .from('wallets')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return data as Wallet[];
  }

  /**
   * Get wallet by ID.
   */
  static async getById(id: string): Promise<Wallet | null> {
    const { data, error } = await getSupabase()
      .from('wallets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data as Wallet;
  }

  /**
   * Get wallet by name (exact match, case-insensitive, then fuzzy match).
   */

  static async getByName(name: string): Promise<Wallet | null> {
    const wallets = await this.list();
    const lowerName = name.toLowerCase().trim();

    // 1. Exact case-insensitive match
    const exactMatch = wallets.find(w => w.name.toLowerCase() === lowerName);
    if (exactMatch) return exactMatch;

    // 2. Fuzzy match
    return this.fuzzyMatch(lowerName, wallets);
  }

  /**
   * Fuzzy match a hint against a list of wallets.
   * Simple Levenshtein or substring match.
   */
  static fuzzyMatch(hint: string, wallets: Wallet[]): Wallet | null {
    const lowerHint = hint.toLowerCase().trim();
    
    // Substring match
    const subMatch = wallets.find(w => w.name.toLowerCase().includes(lowerHint) || lowerHint.includes(w.name.toLowerCase()));
    if (subMatch) return subMatch;

    // Simple Levenshtein distance <= 2
    for (const w of wallets) {
      const lowerW = w.name.toLowerCase();
      if (this.levenshtein(lowerW, lowerHint) <= 2) {
        return w;
      }
    }

    return null;
  }

  /**
   * Simple Levenshtein distance algorithm.
   */
  private static levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(matrix[i][j - 1] + 1, // insertion
                     matrix[i - 1][j] + 1) // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Rename a wallet.
   */
  static async rename(id: string, newName: string): Promise<Wallet> {
    const { data, error } = await getSupabase()
      .from('wallets')
      .update({ name: newName })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Wallet;
  }

  /**
   * Delete a wallet. Blocked if there are transactions.
   */
  static async delete(id: string): Promise<void> {
    const { count, error: countError } = await getSupabase()
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .or(`wallet_id.eq.${id},to_wallet_id.eq.${id}`);

    if (countError) throw countError;

    if (count && count > 0) {
      throw new Error(`Cannot delete — wallet has ${count} transactions.`);
    }

    const { error } = await getSupabase()
      .from('wallets')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Set a wallet as the default.
   */
  static async setDefault(id: string): Promise<void> {
    await this.clearDefault();

    const { error } = await getSupabase()
      .from('wallets')
      .update({ is_default: true })
      .eq('id', id);

    if (error) throw error;
  }

  private static async clearDefault(): Promise<void> {
    await getSupabase()
      .from('wallets')
      .update({ is_default: false })
      .eq('is_default', true);
  }

  /**
   * Adjust balance of a wallet. Called atomically during transaction creation.
   */
  static async adjustBalance(walletId: string, delta: number): Promise<void> {
    // Note: Supabase doesn't natively support relative updates via JS client easily
    // So we fetch and update. In a real highly concurrent system we'd use an RPC.
    const { data: wallet, error: fetchError } = await getSupabase()
      .from('wallets')
      .select('balance')
      .eq('id', walletId)
      .single();

    if (fetchError) throw fetchError;

    const newBalance = Number(wallet.balance) + delta;

    const { error: updateError } = await getSupabase()
      .from('wallets')
      .update({ balance: newBalance })
      .eq('id', walletId);

    if (updateError) throw updateError;
  }

  /**
   * Get total net worth. 
   * Simplification: assume all wallets are in base currency for now, or fetch exchange rates.
   * TRD: "SUM(balance converted to base currency) across all wallets"
   */
  static async getTotalNetWorth(baseCurrency: string): Promise<number> {
    const wallets = await this.list();
    const { CurrencyService } = await import('./currency');
    let total = 0;
    for (const w of wallets) {
      const converted = await CurrencyService.convert(Number(w.balance), w.currency, baseCurrency);
      total += converted;
    }
    return total;
  }

  /**
   * Reconcile a wallet to a real-world balance.
   * Calculates the discrepancy, creates a balancing income (surplus) or expense (deficit) transaction,
   * then directly sets the wallet balance to the target amount.
   *
   * @param walletId    - The wallet to reconcile
   * @param realBalance - The real-world balance (what you physically counted)
   * @param categoryId  - Category for the adjustment transaction
   * @param ownerCurrency - Owner's base currency for transaction conversion
   * @returns The adjustment amount and type ('income' | 'expense' | 'none')
   */
  static async reconcile(
    walletId: string,
    realBalance: number,
    categoryId: string,
    ownerCurrency: string
  ): Promise<{ diff: number; type: 'income' | 'expense' | 'none' }> {
    // 1. Fetch the current wallet
    const wallet = await this.getById(walletId);
    if (!wallet) throw new Error('Wallet not found.');

    const currentBalance = Number(wallet.balance);
    const diff = realBalance - currentBalance;

    if (diff === 0) {
      return { diff: 0, type: 'none' };
    }

    // 2. Log the adjusting transaction (TransactionService will also adjustBalance)
    const { TransactionService } = await import('./transaction');
    const transactionType = diff > 0 ? 'income' : 'expense';
    const amount = Math.abs(diff);

    await TransactionService.create({
      type: transactionType,
      amount,
      currency: wallet.currency,
      wallet_id: walletId,
      category_id: categoryId,
      description: 'Balance Reconciliation',
      date: new Date().toISOString().split('T')[0],
      source: 'manual',
    });

    // 3. TransactionService.create already called adjustBalance (+/- delta), 
    //    but rounding might cause drift. Force-set to the exact real balance.
    const { error } = await getSupabase()
      .from('wallets')
      .update({ balance: realBalance })
      .eq('id', walletId);

    if (error) throw error;

    return { diff: amount, type: transactionType };
  }
}
