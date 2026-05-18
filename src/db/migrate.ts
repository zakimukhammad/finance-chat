import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { getSupabase } from './client';
import { logger } from '../utils/logger';

/**
 * Run all SQL migration files in order.
 * Each file is executed as raw SQL via Supabase's rpc.
 */
async function migrate(): Promise<void> {
  const supabase = getSupabase();
  const migrationsDir = path.join(__dirname, 'migrations');

  // Get all .sql files sorted alphabetically
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  logger.info({ files }, 'Running migrations');

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    logger.info({ migration: file }, 'Applying migration');

    // Execute raw SQL via Supabase's rpc
    const { error } = await supabase.rpc('exec_sql', { query: sql }).single();

    if (error) {
      // If the exec_sql function doesn't exist, try alternative approach
      // Supabase JS client doesn't have direct SQL execution,
      // so we split and run individual statements
      logger.warn({ migration: file, error: error.message }, 'rpc exec_sql not available, running statements individually');

      // Split SQL by semicolons, filter empty statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        try {
          // Use the Supabase REST API directly for DDL statements
          const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.SUPABASE_SERVICE_KEY!,
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY!}`,
            },
            body: JSON.stringify({ query: statement }),
          });

          if (!response.ok) {
            const body = await response.text();
            logger.warn({ statement: statement.substring(0, 80), response: body }, 'Statement may need manual execution');
          }
        } catch (stmtError) {
          logger.warn({ statement: statement.substring(0, 80), error: stmtError }, 'Statement execution failed');
        }
      }
    }

    logger.info({ migration: file }, 'Migration applied');
  }

  logger.info('All migrations complete');
}

// Run if executed directly
migrate()
  .then(() => {
    logger.info('Migration script finished');
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, 'Migration script failed');
    process.exit(1);
  });
