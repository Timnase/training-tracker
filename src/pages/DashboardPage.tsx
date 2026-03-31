import { useNavigate } from 'react-router-dom';
import { usePlans } from '../hooks/usePlans';
import { useWorkouts } from '../hooks/useWorkouts';
import { useActivePlanId } from '../hooks/useSettings';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Card, CardLabel } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { todayLabel, formatDate, daysAgo } from '../utils';
import type { Feeling, WorkoutLog } from '../types';

const FEELING_LABELS: Record<Feeling, string> = {
  tired:     '😴 Tired',
  normal:    '😐 Normal',
  energized: '⚡ Energized',
};

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <Card className="text-center">
      <p className="text-3xl font-extrabold text-primary-500">{value}</p>
      <p className="text-xs text-slate-400 mt-1 font-medium">{label}</p>
    </Card>
  );
}

function LastWorkoutCard({ workout }: { workout: WorkoutLog }) {
  return (
    <Card>
      <CardLabel>Last Workout</CardLabel>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-slate-900">{formatDate(workout.date)}</p>
          <p className="text-sm text-slate-500 mt-0.5">{workout.workoutTemplateName || workout.planName}</p>
        </div>
        {workout.feeling && (
          <Badge variant={workout.feeling}>{FEELING_LABELS[workout.feeling]}</Badge>
        )}
      </div>
      {workout.cardio?.type && (
        <p className="text-sm text-slate-500 mt-2">🏃 {workout.cardio.type} · {workout.cardio.duration} min</p>
      )}
      <div className="mt-3 space-y-1">
        {workout.exercises.slice(0, 3).map(ex => {
          const s = ex.sets[0];
          return (
            <p key={ex.exerciseId} className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{ex.exerciseName}</span>
              {s?.weight ? ` · ${s.weight}kg × ${s.reps ?? '?'}` : s?.reps ? ` · ${s.reps} reps` : ''}
            </p>
          );
        })}
        {workout.exercises.length > 3 && (
          <p className="text-xs text-slate-400">+{workout.exercises.length - 3} more exercises</p>
        )}
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: plans = [],    isLoading: plansLoading }    = usePlans();
  const { data: workouts = [], isLoading: workoutsLoading } = useWorkouts();
  const { data: activePlanId,  isLoading: settingsLoading } = useActivePlanId();

  if (plansLoading || workoutsLoading || settingsLoading) return <Spinner />;

  const activePlan = plans.find(p => p.id === activePlanId) ?? null;
  const lastWorkout = workouts[0] ?? null;

  const now = new Date();
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekCount  = workouts.filter(w => new Date(w.date) >= weekStart).length;
  const monthCount = workouts.filter(w => new Date(w.date) >= monthStart).length;

  // Suggest next workout
  const templates = activePlan?.workouts ?? [];
  const lastPlanWorkout = workouts.find(w => w.planId === activePlanId);
  const lastIdx  = templates.findIndex(t => t.id === lastPlanWorkout?.workoutTemplateId);
  const nextWorkout = templates[(lastIdx + 1) % templates.length] ?? templates[0] ?? null;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Hey, ready to train? 💪</h2>
        <p className="text-sm text-slate-500 mt-0.5">{todayLabel()}</p>
      </div>

      {activePlan ? (
        <Card>
          <CardLabel>Active Plan</CardLabel>
          <p className="text-lg font-extrabold text-slate-900 mb-1">{activePlan.name}</p>
          {nextWorkout && lastPlanWorkout && (
            <p className="text-xs text-slate-400 mb-3">
              Last: {lastPlanWorkout.workoutTemplateName} ({daysAgo(lastPlanWorkout.date)})
            </p>
          )}
          {nextWorkout && (
            <div className="bg-primary-50 rounded-xl px-4 py-2.5 flex items-center gap-3 mb-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-primary-500 flex-shrink-0"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-500">Next up</p>
                <p className="text-sm font-bold text-primary-600">{nextWorkout.name}</p>
              </div>
            </div>
          )}
          <Button fullWidth size="lg" onClick={() => navigate('/log')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            Start Workout
          </Button>
        </Card>
      ) : (
        <Card className="text-center py-8">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-bold text-slate-900 mb-1">No active plan</p>
          <p className="text-sm text-slate-500 mb-4">Create a workout plan to get started</p>
          <Button onClick={() => navigate('/plans')}>Create a Plan</Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard value={weekCount}  label="This Week" />
        <StatCard value={monthCount} label="This Month" />
      </div>

      {lastWorkout && <LastWorkoutCard workout={lastWorkout} />}
    </div>
  );
}
