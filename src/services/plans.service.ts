import { supabase } from '../lib/supabase';
import type { Plan } from '../types';

export const PlansService = {
  async getAll(): Promise<Plan[]> {
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, workouts')
      .order('created_at');
    if (error) throw error;
    return data ?? [];
  },

  async upsert(plan: Plan): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('plans').upsert({
      id:       plan.id,
      user_id:  user!.id,
      name:     plan.name,
      workouts: plan.workouts,
    });
    if (error) throw error;
  },

  async remove(planId: string): Promise<void> {
    const { error } = await supabase.from('plans').delete().eq('id', planId);
    if (error) throw error;
  },
};
