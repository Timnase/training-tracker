import { supabase } from '../lib/supabase';
import type { WorkoutLog, WorkoutRow } from '../types';

function rowToLog(row: WorkoutRow): WorkoutLog {
  return {
    id:                   row.id,
    planId:               row.plan_id,
    planName:             row.plan_name,
    workoutTemplateId:    row.workout_template_id ?? '',
    workoutTemplateName:  row.workout_template_name ?? '',
    date:                 row.date,
    startedAt:            null,
    feeling:              row.feeling,
    cardio:               row.cardio,
    exercises:            row.exercises,
    notes:                row.notes,
  };
}

export const WorkoutsService = {
  async getAll(): Promise<WorkoutLog[]> {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as WorkoutRow[]).map(rowToLog);
  },

  async insert(log: WorkoutLog): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('workouts').insert({
      id:                    log.id,
      user_id:               user!.id,
      plan_id:               log.planId,
      plan_name:             log.planName,
      workout_template_id:   log.workoutTemplateId,
      workout_template_name: log.workoutTemplateName,
      date:                  log.date,
      feeling:               log.feeling,
      cardio:                log.cardio,
      exercises:             log.exercises,
      notes:                 log.notes,
    });
    if (error) throw error;
  },

  async remove(workoutId: string): Promise<void> {
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
    if (error) throw error;
  },
};
