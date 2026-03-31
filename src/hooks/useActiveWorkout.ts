import { useState, useCallback } from 'react';
import type { WorkoutLog, SetLog, Feeling, Cardio } from '../types';

const STORAGE_KEY = 'tt_active_workout_v2';

function load(): WorkoutLog | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkoutLog) : null;
  } catch {
    return null;
  }
}

function save(wo: WorkoutLog | null): void {
  if (wo) localStorage.setItem(STORAGE_KEY, JSON.stringify(wo));
  else     localStorage.removeItem(STORAGE_KEY);
}

export function useActiveWorkout() {
  const [workout, setWorkoutState] = useState<WorkoutLog | null>(load);

  const setWorkout = useCallback((wo: WorkoutLog | null) => {
    setWorkoutState(wo);
    save(wo);
  }, []);

  const updateSet = useCallback((exId: string, setIdx: number, patch: Partial<SetLog>) => {
    setWorkoutState(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map(ex => {
        if (ex.exerciseId !== exId) return ex;
        const sets = ex.sets.map((s, i) => i === setIdx ? { ...s, ...patch } : s);
        return { ...ex, sets };
      });
      const updated = { ...prev, exercises };
      save(updated);
      return updated;
    });
  }, []);

  const addSet = useCallback((exId: string) => {
    setWorkoutState(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map(ex => {
        if (ex.exerciseId !== exId) return ex;
        return { ...ex, sets: [...ex.sets, { weight: null, reps: null, difficulty: null }] };
      });
      const updated = { ...prev, exercises };
      save(updated);
      return updated;
    });
  }, []);

  const removeSet = useCallback((exId: string, setIdx: number) => {
    setWorkoutState(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map(ex => {
        if (ex.exerciseId !== exId) return ex;
        return { ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) };
      });
      const updated = { ...prev, exercises };
      save(updated);
      return updated;
    });
  }, []);

  const updateExerciseNote = useCallback((exId: string, note: string) => {
    setWorkoutState(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map(ex =>
        ex.exerciseId === exId ? { ...ex, note } : ex
      );
      const updated = { ...prev, exercises };
      save(updated);
      return updated;
    });
  }, []);

  const setFeeling = useCallback((feeling: Feeling) => {
    setWorkoutState(prev => {
      if (!prev) return prev;
      const updated = { ...prev, feeling };
      save(updated);
      return updated;
    });
  }, []);

  const setCardio = useCallback((cardio: Cardio | null) => {
    setWorkoutState(prev => {
      if (!prev) return prev;
      const updated = { ...prev, cardio };
      save(updated);
      return updated;
    });
  }, []);

  const setNotes = useCallback((notes: string) => {
    setWorkoutState(prev => {
      if (!prev) return prev;
      const updated = { ...prev, notes };
      save(updated);
      return updated;
    });
  }, []);

  return {
    workout,
    setWorkout,
    updateSet,
    addSet,
    removeSet,
    updateExerciseNote,
    setFeeling,
    setCardio,
    setNotes,
  };
}
