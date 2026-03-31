import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlans } from '../hooks/usePlans';
import { useWorkouts } from '../hooks/useWorkouts';
import { useActivePlanId } from '../hooks/useSettings';
import { useActiveWorkout } from '../hooks/useActiveWorkout';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Header } from '../components/layout/Header';
import { daysAgo, uid } from '../utils';
import type { WorkoutLog } from '../types';

export function LogPage() {
  const navigate = useNavigate();
  const { data: plans = [],    isLoading: plansLoading }    = usePlans();
  const { data: workouts = [], isLoading: workoutsLoading } = useWorkouts();
  const { data: activePlanId,  isLoading: settingsLoading } = useActivePlanId();
  const { workout, setWorkout } = useActiveWorkout();

  // If there's already an in-progress workout, go straight to session
  useEffect(() => {
    if (workout) navigate('/log/session', { replace: true });
  }, [workout, navigate]);

  if (plansLoading || workoutsLoading || settingsLoading) return <Spinner />;

  const activePlan = plans.find(p => p.id === activePlanId) ?? null;

  if (!activePlan) {
    return (
      <>
        <Header title="Log Workout" />
        <div className="p-4 text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-bold text-slate-900 mb-1">No active plan</p>
          <p className="text-sm text-slate-500 mb-5">Create and activate a plan first</p>
          <Button onClick={() => navigate('/plans')}>Go to Plans</Button>
        </div>
      </>
    );
  }

  if (activePlan.workouts.length === 0) {
    return (
      <>
        <Header title="Log Workout" />
        <div className="p-4 text-center py-16">
          <p className="font-bold text-slate-900 mb-1">Plan has no workouts</p>
          <Button onClick={() => navigate(`/plans/${activePlan.id}`)}>Edit Plan</Button>
        </div>
      </>
    );
  }

  const startWorkout = (workoutTemplateId: string) => {
    const wt = activePlan.workouts.find(w => w.id === workoutTemplateId)!;
    const newWorkout: WorkoutLog = {
      id:                  uid(),
      planId:              activePlan.id,
      planName:            activePlan.name,
      workoutTemplateId:   wt.id,
      workoutTemplateName: wt.name,
      date:                new Date().toISOString(),
      feeling:             null,
      cardio:              null,
      notes:               '',
      exercises:           wt.exercises.map(ex => ({
        exerciseId:   ex.id,
        exerciseName: ex.name,
        sets:         Array.from({ length: ex.defaultSets }, () => ({ weight: null, reps: null, difficulty: null })),
        note:         '',
      })),
    };
    setWorkout(newWorkout);
    navigate('/log/session');
  };

  return (
    <>
      <Header title="Log Workout" />
      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">{activePlan.name}</p>
          <p className="text-lg font-extrabold text-slate-900 mt-0.5">Choose today's workout</p>
        </div>

        <div className="space-y-3">
          {activePlan.workouts.map(wt => {
            const lastDone = workouts.find(w => w.workoutTemplateId === wt.id);
            return (
              <Card key={wt.id} onClick={() => startWorkout(wt.id)}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{wt.name}</p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {wt.exercises.length} exercises · Last: {lastDone ? daysAgo(lastDone.date) : 'Never'}
                    </p>
                  </div>
                  <Button size="sm" onClick={e => { e.stopPropagation(); startWorkout(wt.id); }}>
                    Start
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
