import { getSupabase } from '../db/client';
import { Owner, OwnerSettings } from '../types';
import { DEFAULT_OWNER_SETTINGS } from '../utils/constants';

export class OwnerService {
  /**
   * Get the owner record. Assumes single-user setup where owner ID matches TELEGRAM_OWNER_ID env.
   */
  static async getOwner(telegramId: number): Promise<Owner | null> {
    const { data, error } = await getSupabase()
      .from('owner')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data as Owner;
  }

  /**
   * Upsert the owner record (used during onboarding).
   */
  static async upsertOwner(telegramId: number, currency: string, timezone: string): Promise<Owner> {
    const { data, error } = await getSupabase()
      .from('owner')
      .upsert(
        {
          telegram_id: telegramId,
          currency,
          timezone,
          settings: DEFAULT_OWNER_SETTINGS,
        },
        { onConflict: 'telegram_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as Owner;
  }

  /**
   * Update owner settings.
   */
  static async updateSettings(telegramId: number, settings: Partial<OwnerSettings>): Promise<Owner> {
    const owner = await this.getOwner(telegramId);
    if (!owner) throw new Error('Owner not found');

    const newSettings = { ...owner.settings, ...settings };

    const { data, error } = await getSupabase()
      .from('owner')
      .update({ settings: newSettings })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw error;
    return data as Owner;
  }
}
