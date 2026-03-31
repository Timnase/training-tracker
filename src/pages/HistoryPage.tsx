import { useState } from 'react';
import { useWorkouts, useDeleteWorkout } from '../hooks/useWorkouts';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, daysAgo } from '../utils';
import type { WorkoutLog, Feeling } from '../types';

function feelingBadge(f: Feeling | null) {
  if (!f) return null;
  const map: Record<Feeling, { label: string; emoji: string }> = {
    tired:     { label: 'Tired',     emoji: '😴' },
    normal:    { label: 'Normal',    emoji: '😐' },
    energized: { label: 'Energized', emoji: '⚡' },
  };
  return <Badge variant={f}>{map[f].emoji} {map[f].label}</Badge>;
}

function WorkoutCard({ workout }: { workout: WorkoutLog }) {
  const [open, setOpen] = useState(false);
  const deleteWorkout   = useDeleteWorkout();

  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.filter(s => s.reps || s.weight).length, 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 leading-tight">{workout.workoutTemplateName}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatDate(workout.date)} · {daysAgo(workout.date)} · {totalSets} sets
            {workout.planName ? ` · ${workout.planName}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {feelingBadge(workout.feeling)}
            {workout.cardio && (
              <Badge variant="primary">
                {workout.cardio.type || 'Cardio'}{workout.cardio.duration ? ` ${workout.cardio.duration}min` : ''}
              </Badge>
            )}
          </div>
        </div>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className={`w-5 h-5 text-slate-300 mt-0.5 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-4">
          {workout.exercises.map(ex => (
            <div key={ex.exerciseId}>
              <p className="font-semibold text-slate-800 text-sm mb-1">{ex.exerciseName}</p>
              {ex.sets.length === 0 ? (
                <p className="text-xs text-slate-400">No sets</p>
              ) : (
                <div className="space-y-0.5">
                  {ex.sets.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="text-slate-400 w-5 text-center font-bold">{i + 1}</span>
                      <span>{s.weight != null ? `${s.weight} kg` : '—'}</span>
                      <span className="text-slate-300">×</span>
                      <span>{s.reps != null ? `${s.reps} reps` : '—'}</span>
                      {s.difficulty && (
                        <Badge variant={s.difficulty} className="text-[10px] py-0">
                          {s.difficulty[0].toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {ex.note && <p className="text-xs text-slate-400 italic mt-1">"{ex.note}"</p>}
            </div>
          ))}

          {workout.notes && (
            <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">{workout.notes}</p>
          )}

          <button
            className="text-xs text-red-400 hover:text-red-500 font-semibold mt-1"
            onClick={() => {
              if (!confirm('Delete this workout entry?')) return;
              deleteWorkout.mutate(workout.id);
            }}
          >
            Delete entry
          </button>
        </div>
      )}
    </div>
  );
}

export function HistoryPage() {
  const { data: workouts = [], isLoading } = useWorkouts();

  return (
    <>
      <Header title="History" />
      <div className="p-4 space-y-3 pb-8">
        {isLoading ? (
          <Spinner />
        ) : workouts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📖</p>
            <p className="font-bold text-slate-900 mb-1">No workouts yet</p>
            <p className="text-sm text-slate-500">Log your first session to see it here</p>
          </div>
        ) : (
          workouts.map(w => <WorkoutCard key={w.id} workout={w} />)
        )}
      </div>
    </>
  );
}
