import { supabase } from '../lib/supabase';
import type { ProfileRow } from '../types';

export const ProfileService = {
  async getProfile(): Promise<ProfileRow | null> {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, updated_at')
      .maybeSingle();
    return data ?? null;
  },

  async upsertProfile(displayName: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('profiles').upsert({
      id:           user!.id,
      display_name: displayName.trim() || null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
  },
};
