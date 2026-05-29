import { getSupabase } from '../db/client';
import { logger } from '../utils/logger';

export class ResetService {
  /**
   * Securely reset all user data from the database.
   * Wipes: transactions, budgets, goals, recurring_transactions, wallets, and owner.
   */
  static async resetAllData(telegramId: number): Promise<void> {
    const supabase = getSupabase();
    logger.info({ telegramId }, 'Initiating full data reset for owner');

    // 1. Delete all transactions
    const { error: txError } = await supabase
      .from('transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (txError) {
      logger.error({ txError }, 'Failed to delete transactions during reset');
      throw txError;
    }

    // 2. Delete all budgets
    const { error: budgetError } = await supabase
      .from('budgets')
      .delete()
      .neq('category_id', '00000000-0000-0000-0000-000000000000');
    if (budgetError) {
      logger.error({ budgetError }, 'Failed to delete budgets during reset');
      throw budgetError;
    }

    // 3. Delete all recurring transactions
    const { error: recurringError } = await supabase
      .from('recurring_transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (recurringError) {
      logger.error({ recurringError }, 'Failed to delete recurring transactions during reset');
      throw recurringError;
    }

    // 4. Delete all goals
    const { error: goalError } = await supabase
      .from('savings_goals')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (goalError) {
      logger.error({ goalError }, 'Failed to delete goals during reset');
      throw goalError;
    }

    // 5. Delete all custom wallets
    const { error: walletError } = await supabase
      .from('wallets')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (walletError) {
      logger.error({ walletError }, 'Failed to delete wallets during reset');
      throw walletError;
    }

    // 6. Delete owner record to trigger onboarding again
    const { error: ownerError } = await supabase
      .from('owner')
      .delete()
      .eq('telegram_id', telegramId);
    if (ownerError) {
      logger.error({ ownerError }, 'Failed to delete owner record during reset');
      throw ownerError;
    }

    logger.info({ telegramId }, 'Full data reset completed successfully');
  }
}
