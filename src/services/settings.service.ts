import { supabase } from '../lib/supabase';

export const SettingsService = {
  async getActivePlanId(): Promise<string | null> {
    const { data } = await supabase
      .from('user_settings')
      .select('active_plan_id')
      .maybeSingle();
    return data?.active_plan_id ?? null;
  },

  async setActivePlanId(planId: string | null): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('user_settings').upsert({
      user_id:        user!.id,
      active_plan_id: planId,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  },
};
