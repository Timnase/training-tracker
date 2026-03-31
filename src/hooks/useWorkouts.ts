import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutsService } from '../services/workouts.service';
import type { WorkoutLog } from '../types';

const QUERY_KEY = ['workouts'] as const;

export function useWorkouts() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn:  WorkoutsService.getAll,
  });
}

export function useInsertWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: WorkoutsService.insert,
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: WorkoutsService.remove,
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Last logged session for a given exercise, used to show previous performance. */
export function useLastExerciseLog(exerciseId: string, allWorkouts: WorkoutLog[]) {
  for (const wo of allWorkouts) {
    const ex = wo.exercises.find(e => e.exerciseId === exerciseId);
    if (ex && ex.sets.length > 0) return { workout: wo, exLog: ex };
  }
  return null;
}
