import 'dotenv/config';
import { getSupabase } from './client';
import { logger } from '../utils/logger';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../utils/constants';

/**
 * Seed the database with default categories.
 * Idempotent: skips categories that already exist (by name).
 */
async function seed(): Promise<void> {
  const supabase = getSupabase();

  logger.info('Starting database seed');

  // ─── Seed Expense Categories ────────────────────────────────────────────
  for (let i = 0; i < DEFAULT_EXPENSE_CATEGORIES.length; i++) {
    const cat = DEFAULT_EXPENSE_CATEGORIES[i];

    // Check if category already exists
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('name', cat.name)
      .eq('type', 'expense')
      .single();

    if (existing) {
      logger.debug({ name: cat.name }, 'Expense category already exists, skipping');
      continue;
    }

    const { error } = await supabase.from('categories').insert({
      name: cat.name,
      icon: cat.icon,
      type: 'expense',
      color: cat.color,
      is_system: true,
      sort_order: i,
    });

    if (error) {
      logger.error({ error, name: cat.name }, 'Failed to insert expense category');
    } else {
      logger.info({ name: cat.name, icon: cat.icon }, 'Inserted expense category');
    }
  }

  // ─── Seed Income Categories ─────────────────────────────────────────────
  for (let i = 0; i < DEFAULT_INCOME_CATEGORIES.length; i++) {
    const cat = DEFAULT_INCOME_CATEGORIES[i];

    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('name', cat.name)
      .eq('type', 'income')
      .single();

    if (existing) {
      logger.debug({ name: cat.name }, 'Income category already exists, skipping');
      continue;
    }

    const { error } = await supabase.from('categories').insert({
      name: cat.name,
      icon: cat.icon,
      type: 'income',
      color: cat.color,
      is_system: true,
      sort_order: i + 100, // Income categories after expense
    });

    if (error) {
      logger.error({ error, name: cat.name }, 'Failed to insert income category');
    } else {
      logger.info({ name: cat.name, icon: cat.icon }, 'Inserted income category');
    }
  }

  // ─── Seed Default Wallet ────────────────────────────────────────────────
  const { data: existingWallets } = await supabase
    .from('wallets')
    .select('id')
    .eq('name', 'Cash');

  if (!existingWallets || existingWallets.length === 0) {
    const { error: walletError } = await supabase.from('wallets').insert({
      name: 'Cash',
      icon: '💵',
      type: 'cash',
      currency: 'IDR',
      balance: 0,
      is_default: true,
      sort_order: 0,
    });
    if (walletError) {
      logger.error({ error: walletError }, 'Failed to insert default Cash wallet');
    } else {
      logger.info('Inserted default Cash wallet');
    }
  } else {
    logger.debug('Default Cash wallet already exists, skipping');
  }

  logger.info('Database seed complete');
}

// Run if executed directly
seed()
  .then(() => {
    logger.info('Seed script finished');
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, 'Seed script failed');
    process.exit(1);
  });
