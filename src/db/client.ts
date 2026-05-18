import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { logger } from '../utils/logger';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get or create the Supabase client singleton.
 * Uses the service_role key for full database access.
 */
export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  supabaseInstance = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: ws as any,
    },
  });

  logger.info('Supabase client initialized');
  return supabaseInstance;
}

/**
 * Test the Supabase connection by running a simple query.
 */
export async function testConnection(): Promise<boolean> {
  try {
    const supabase = getSupabase();
    // Use a simple RPC or raw query to verify connectivity
    const { error } = await supabase.from('owner').select('id').limit(1);
    // It's OK if the table doesn't exist yet (during initial setup)
    // We just want to verify the connection itself works
    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    logger.info('Supabase connection verified');
    return true;
  } catch (err) {
    logger.error({ err }, 'Supabase connection failed');
    return false;
  }
}
