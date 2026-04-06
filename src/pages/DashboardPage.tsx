import { useNavigate } from 'react-router-dom';
import { usePlans } from '../hooks/usePlans';
import { useWorkouts } from '../hooks/useWorkouts';
import { useActivePlanId } from '../hooks/useSettings';
import { useActiveWorkout } from '../hooks/useActiveWorkout';
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
  const { setWorkout } = useActiveWorkout();

  if (plansLoading || workoutsLoading || settingsLoading) return <Spinner />;

  const activePlan  = plans.find(p => p.id === activePlanId) ?? null;
  const lastWorkout = workouts[0] ?? null;

  const now = new Date();
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekCount  = workouts.filter(w => new Date(w.date) >= weekStart).length;
  const monthCount = workouts.filter(w => new Date(w.date) >= monthStart).length;

  // Determine suggested next workout
  const templates       = activePlan?.workouts ?? [];
  const lastPlanWorkout = workouts.find(w => w.planId === activePlanId);
  const lastIdx         = templates.findIndex(t => t.id === lastPlanWorkout?.workoutTemplateId);
  const nextId          = templates[(lastIdx + 1) % templates.length]?.id ?? templates[0]?.id;

  const startWorkout = (workoutTemplateId: string) => {
    const wt = activePlan!.workouts.find(w => w.id === workoutTemplateId)!;
    setWorkout({
      id: crypto.randomUUID(),
      planId: activePlan!.id, planName: activePlan!.name,
      workoutTemplateId: wt.id, workoutTemplateName: wt.name,
      date: new Date().toISOString(), startedAt: new Date().toISOString(),
      feeling: null, cardio: null, notes: '',
      exercises: wt.exercises.map(ex => ({
        exerciseId: ex.id, exerciseName: ex.name,
        sets: Array.from({ length: ex.defaultSets }, () => ({ weight: null, reps: null, difficulty: null })),
        note: '',
      })),
    });
    navigate('/log/session');
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Hey, ready to train? 💪</h2>
        <p className="text-sm text-slate-500 mt-0.5">{todayLabel()}</p>
      </div>

      {activePlan ? (
        <Card>
          <CardLabel>Active Plan · {activePlan.name}</CardLabel>
          {lastPlanWorkout && (
            <p className="text-xs text-slate-400 mb-3">
              Last: {lastPlanWorkout.workoutTemplateName} ({daysAgo(lastPlanWorkout.date)})
            </p>
          )}
          <div className="space-y-2">
            {templates.map(wt => {
              const isNext = wt.id === nextId;
              return (
                <button
                  key={wt.id}
                  onClick={() => startWorkout(wt.id)}
                  className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-all active:scale-[0.98]
                    ${isNext
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 flex-shrink-0"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{wt.name}</p>
                    <p className={`text-xs mt-0.5 ${isNext ? 'text-primary-200' : 'text-slate-400'}`}>
                      {wt.exercises.length} exercises{isNext ? ' · Next up' : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
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
