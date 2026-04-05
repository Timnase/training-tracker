import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveWorkout } from '../hooks/useActiveWorkout';
import { useInsertWorkout } from '../hooks/useWorkouts';
import { useWorkouts } from '../hooks/useWorkouts';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { Input, Textarea } from '../components/ui/Input';
import { daysAgo } from '../utils';
import type { Difficulty, Exercise, ExerciseLog, Feeling, SetLog } from '../types';

// ─── Elapsed workout timer ────────────────────────────────────────────────────

function useElapsedTime(startedAt: string | null | undefined): string {
  // If startedAt is missing (old workout in localStorage), fall back to "now"
  // so the timer always starts at 0:00 instead of showing stale time.
  const anchorRef = useRef(startedAt ?? new Date().toISOString());
  if (startedAt) anchorRef.current = startedAt; // update if it becomes available

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const anchor = anchorRef.current;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(anchor).getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);                                        // run once on mount — anchor is stable via ref
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Rest timer sound (Web Audio API — no external files needed) ──────────────

function playDoneSound() {
  try {
    const ctx = new AudioContext();
    // Three ascending notes: C5 → E5 → G5
    ([
      [0,    523.25, 0.18],
      [0.18, 659.25, 0.18],
      [0.36, 783.99, 0.35],
    ] as [number, number, number][]).forEach(([when, freq, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + when);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + dur + 0.05);
    });
  } catch { /* browser blocked audio — silently ignore */ }
}

// ─── Rest timer ───────────────────────────────────────────────────────────────

const PRESETS = [30, 60, 90, 120, 180];

function RestTimer() {
  const [duration,  setDuration]  = useState(90);
  const [custom,    setCustom]    = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [total,     setTotal]     = useState(90); // duration used for current run (for pct)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = (secs: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTotal(secs);
    setRemaining(secs);
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r === null || r <= 1) {
          clearInterval(intervalRef.current!);
          playDoneSound();
          return null;
        }
        return r - 1;
      });
    }, 1000);
  };

  const stop = () => { if (intervalRef.current) clearInterval(intervalRef.current); setRemaining(null); };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // ── Idle state: preset picker + custom input ──
  if (remaining === null) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 p-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 text-center">Rest Timer</p>
        <div className="flex gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p}
              onClick={() => { setDuration(p); setCustom(''); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all
                ${duration === p && !custom
                  ? 'border-primary-500 bg-primary-50 text-primary-600'
                  : 'border-slate-200 text-slate-400'}`}
            >
              {p >= 60 ? `${p / 60}m` : `${p}s`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="5"
            max="600"
            placeholder="Custom (s)"
            value={custom}
            onChange={e => { setCustom(e.target.value); if (e.target.value) setDuration(parseInt(e.target.value)); }}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm text-center focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={() => start(duration)}
            className="flex-1 py-2 rounded-xl bg-primary-500 text-white text-sm font-bold hover:bg-primary-600 transition-colors"
          >
            ▶ Start {duration}s
          </button>
        </div>
      </div>
    );
  }

  // ── Running state ──
  const pct    = (remaining / total) * 100;
  const urgent = remaining <= 10;
  return (
    <div className={`rounded-xl p-3 flex items-center gap-3 ${urgent ? 'bg-red-50' : 'bg-primary-50'}`}>
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15" fill="none"
            stroke={urgent ? '#ef4444' : '#6366f1'}
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 15}`}
            strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct / 100)}`}
            strokeLinecap="round"
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${urgent ? 'text-red-500' : 'text-primary-600'}`}>
          {remaining}
        </span>
      </div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${urgent ? 'text-red-500' : 'text-primary-700'}`}>
          {urgent ? 'Almost done!' : 'Resting…'}
        </p>
        <p className="text-xs text-slate-400">{remaining}s remaining</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => start(total)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Reset</button>
        <button onClick={stop}              className="text-xs font-semibold text-primary-500 hover:text-primary-700">Skip</button>
      </div>
    </div>
  );
}

// ─── Feeling selector ─────────────────────────────────────────────────────────

const FEELINGS: { value: Feeling; emoji: string; label: string }[] = [
  { value: 'tired',     emoji: '😴', label: 'Tired'     },
  { value: 'normal',    emoji: '😐', label: 'Normal'    },
  { value: 'energized', emoji: '⚡', label: 'Energized' },
];

function FeelingSelector({ value, onChange }: { value: Feeling | null; onChange: (f: Feeling) => void }) {
  return (
    <div className="flex gap-2">
      {FEELINGS.map(f => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all
            ${value === f.value
              ? f.value === 'tired'     ? 'border-violet-400 bg-violet-50 text-violet-600'
              : f.value === 'normal'    ? 'border-blue-400 bg-blue-50 text-blue-600'
              :                           'border-amber-400 bg-amber-50 text-amber-600'
              : 'border-slate-200 text-slate-400'
            }`}
        >
          <span className="text-2xl">{f.emoji}</span>
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Difficulty buttons ───────────────────────────────────────────────────────

const DIFF_CONFIG: { value: Difficulty; label: string; classes: string }[] = [
  { value: 'easy',     label: 'E', classes: 'active:bg-easy-light    active:text-easy    active:border-easy'     },
  { value: 'moderate', label: 'M', classes: 'active:bg-moderate-light active:text-moderate active:border-moderate' },
  { value: 'hard',     label: 'H', classes: 'active:bg-hard-light    active:text-hard    active:border-hard'     },
];

const DIFF_ACTIVE: Record<Difficulty, string> = {
  easy:     'bg-easy-light text-easy border-easy',
  moderate: 'bg-moderate-light text-moderate border-moderate',
  hard:     'bg-hard-light text-hard border-hard',
};

function DiffButton({ value, current, onChange }: { value: Difficulty; current: Difficulty | null; onChange: (d: Difficulty) => void }) {
  const config = DIFF_CONFIG.find(d => d.value === value)!;
  const isActive = current === value;
  return (
    <button
      onClick={() => onChange(value)}
      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 transition-all
        ${isActive ? DIFF_ACTIVE[value] : `border-slate-200 text-slate-300 ${config.classes}`}`}
    >
      {config.label}
    </button>
  );
}

// ─── Set row ──────────────────────────────────────────────────────────────────

interface SetRowProps {
  index:    number;
  set:      SetLog;
  lastSet:  SetLog | null;
  onUpdate: (patch: Partial<SetLog>) => void;
  onRemove: () => void;
}

function SetRow({ index, set, lastSet, onUpdate, onRemove }: SetRowProps) {
  return (
    <div className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-1.5 items-center mb-2">
      <span className="text-xs font-bold text-slate-400 text-center">{index + 1}</span>

      <input
        type="number" inputMode="decimal"
        placeholder={lastSet?.weight != null ? String(lastSet.weight) : '—'}
        value={set.weight ?? ''}
        onChange={e => onUpdate({ weight: e.target.value === '' ? null : parseFloat(e.target.value) })}
        className="w-full px-2 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-center bg-white focus:outline-none focus:border-primary-500"
      />
      <input
        type="number" inputMode="numeric"
        placeholder={lastSet?.reps != null ? String(lastSet.reps) : '—'}
        value={set.reps ?? ''}
        onChange={e => onUpdate({ reps: e.target.value === '' ? null : parseInt(e.target.value) })}
        className="w-full px-2 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-center bg-white focus:outline-none focus:border-primary-500"
      />

      <div className="flex gap-1">
        {(['easy','moderate','hard'] as Difficulty[]).map(d => (
          <DiffButton key={d} value={d} current={set.difficulty} onChange={diff => onUpdate({ difficulty: diff })} />
        ))}
      </div>

      <button onClick={onRemove} className="text-slate-300 hover:text-red-400 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ─── Exercise block ───────────────────────────────────────────────────────────

interface ExerciseBlockProps {
  exercise:    Exercise;
  log:         ExerciseLog;
  allWorkouts: { exercises: ExerciseLog[]; date: string }[];
  onUpdateSet: (setIdx: number, patch: Partial<SetLog>) => void;
  onAddSet:    () => void;
  onRemoveSet: (setIdx: number) => void;
  onNoteChange:(note: string) => void;
}

function ExerciseBlock({ exercise, log, allWorkouts, onUpdateSet, onAddSet, onRemoveSet, onNoteChange }: ExerciseBlockProps) {
  const lastWo = allWorkouts.find(w => w.exercises.some(e => e.exerciseId === exercise.id));
  const lastLog = lastWo?.exercises.find(e => e.exerciseId === exercise.id) ?? null;

  const lastPerfText = lastLog?.sets.length
    ? lastLog.sets.map((s, i) => `S${i + 1}: ${s.weight ? s.weight + 'kg × ' : ''}${s.reps ?? '?'}${s.difficulty ? ` (${s.difficulty})` : ''}`).join(' · ')
    : 'First time — go for it!';

  return (
    <div className="py-3 px-4">
      <p className="font-bold text-slate-900">{exercise.name}</p>
      <p className="text-xs text-slate-400 mt-0.5 mb-3">
        {lastWo ? `📅 ${daysAgo(lastWo.date)} · ` : ''}{lastPerfText}
      </p>

      {/* Column labels */}
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-1.5 mb-1">
        {['', 'kg', 'reps', 'feel', ''].map((l, i) => (
          <span key={i} className="text-[10px] font-bold uppercase text-slate-400 text-center">{l}</span>
        ))}
      </div>

      {log.sets.map((set, i) => (
        <SetRow
          key={i}
          index={i}
          set={set}
          lastSet={lastLog?.sets[i] ?? null}
          onUpdate={patch => onUpdateSet(i, patch)}
          onRemove={() => onRemoveSet(i)}
        />
      ))}

      <Button variant="ghost" size="sm" fullWidth onClick={onAddSet} className="mt-1">
        + Add Set
      </Button>
      <Input
        className="mt-3 text-sm py-2"
        placeholder="Notes for next time..."
        value={log.note}
        onChange={e => onNoteChange(e.target.value)}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LogSessionPage() {
  const navigate      = useNavigate();
  const insertWorkout = useInsertWorkout();
  const { data: allWorkouts = [] } = useWorkouts();
  const { workout, setWorkout, updateSet, addSet, removeSet, updateExerciseNote, setFeeling, setCardio, setNotes } = useActiveWorkout();
  const elapsed = useElapsedTime(workout?.startedAt);

  if (!workout) {
    navigate('/log', { replace: true });
    return null;
  }

  // We need the plan's exercise objects for grouping — reconstruct from the log
  const exercisesForGrouping: Exercise[] = workout.exercises.map(e => ({
    id:             e.exerciseId,
    name:           e.exerciseName,
    defaultSets:    e.sets.length,
    defaultReps:    '',
    supersetGroupId: null, // grouping not critical here; just show individually
  }));

  const finish = async () => {
    const hasData = workout.exercises.some(e => e.sets.some(s => s.weight || s.reps));
    if (!hasData && !confirm('No sets logged yet. Save anyway?')) return;
    await insertWorkout.mutateAsync({ ...workout, date: new Date().toISOString() });
    setWorkout(null);
    navigate('/', { replace: true });
  };

  const discard = () => {
    if (!confirm('Discard this workout?')) return;
    setWorkout(null);
    navigate('/log', { replace: true });
  };

  return (
    <>
      <Header title={workout.workoutTemplateName} showBack />

      <div className="p-4 space-y-5 pb-8">
        {/* Plan name + elapsed timer */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">{workout.planName}</p>
          <span className="text-sm font-bold text-primary-500 tabular-nums">⏱ {elapsed}</span>
        </div>

        {/* Rest timer */}
        <RestTimer />

        {/* Feeling */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">How do you feel?</p>
          <FeelingSelector value={workout.feeling} onChange={setFeeling} />
        </section>

        {/* Cardio */}
        <section>
          <Toggle
            label="Include cardio warmup"
            checked={workout.cardio !== null}
            onChange={checked => setCardio(checked ? { type: '', duration: null } : null)}
          />
          {workout.cardio !== null && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input
                label="Type"
                placeholder="Stairs, Treadmill..."
                value={workout.cardio.type}
                onChange={e => setCardio({ ...workout.cardio!, type: e.target.value })}
              />
              <Input
                label="Duration (min)"
                type="number"
                placeholder="20"
                value={workout.cardio.duration ?? ''}
                onChange={e => setCardio({ ...workout.cardio!, duration: e.target.value ? parseInt(e.target.value) : null })}
              />
            </div>
          )}
        </section>

        {/* Exercises */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Exercises</p>
          <div className="space-y-3">
            {workout.exercises.map(log => (
              <div key={log.exerciseId} className="bg-white rounded-2xl shadow-sm">
                <ExerciseBlock
                  exercise={exercisesForGrouping.find(e => e.id === log.exerciseId)!}
                  log={log}
                  allWorkouts={allWorkouts}
                  onUpdateSet={(i, patch) => updateSet(log.exerciseId, i, patch)}
                  onAddSet={() => addSet(log.exerciseId)}
                  onRemoveSet={i => removeSet(log.exerciseId, i)}
                  onNoteChange={note => updateExerciseNote(log.exerciseId, note)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Workout notes */}
        <Textarea
          label="Workout Notes"
          placeholder="General notes about today's session..."
          rows={2}
          value={workout.notes}
          onChange={e => setNotes(e.target.value)}
        />

        <Button fullWidth size="lg" loading={insertWorkout.isPending} onClick={finish}>
          ✓ Finish Workout
        </Button>
        <Button fullWidth variant="ghost" size="sm" onClick={discard}>
          Discard Workout
        </Button>
      </div>
    </>
  );
}
