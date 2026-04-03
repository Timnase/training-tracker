// ─── Domain ───────────────────────────────────────────────────────────────────

export interface Exercise {
  id: string;
  name: string;
  defaultSets: number;
  defaultReps: string;
  supersetGroupId: string | null;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: Exercise[];
}

export interface Plan {
  id: string;
  name: string;
  workouts: WorkoutTemplate[];
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'moderate' | 'hard';
export type Feeling    = 'tired' | 'normal' | 'energized';

export interface SetLog {
  weight:     number | null;
  reps:       number | null;
  difficulty: Difficulty | null;
}

export interface ExerciseLog {
  exerciseId:   string;
  exerciseName: string;
  sets:         SetLog[];
  note:         string;
}

export interface Cardio {
  type:     string;
  duration: number | null;
}

export interface WorkoutLog {
  id:                   string;
  planId:               string;
  planName:             string;
  workoutTemplateId:    string;
  workoutTemplateName:  string;
  date:                 string;
  startedAt:            string | null;   // ISO timestamp when workout began
  feeling:              Feeling | null;
  cardio:               Cardio | null;
  exercises:            ExerciseLog[];
  notes:                string;
}

// ─── Supabase row shapes ───────────────────────────────────────────────────────

export interface PlanRow {
  id:         string;
  user_id:    string;
  name:       string;
  workouts:   WorkoutTemplate[];
  created_at: string;
}

export interface WorkoutRow {
  id:                   string;
  user_id:              string;
  plan_id:              string;
  plan_name:            string;
  workout_template_id:  string | null;
  workout_template_name:string | null;
  date:                 string;
  feeling:              Feeling | null;
  cardio:               Cardio | null;
  exercises:            ExerciseLog[];
  notes:                string;
}

export interface UserSettingsRow {
  user_id:        string;
  active_plan_id: string | null;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

/** Exercises grouped for rendering (single or superset pair). */
export type ExerciseGroup =
  | { type: 'single';   exercises: [Exercise] }
  | { type: 'superset'; exercises: Exercise[] };
