import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveWorkout } from '../hooks/useActiveWorkout';
import { useUpsertWorkout } from '../hooks/useWorkouts';
import { useWorkouts } from '../hooks/useWorkouts';
import { usePlan, useUpsertPlan } from '../hooks/usePlans';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/Modal';
import { daysAgo, groupExercises } from '../utils';
import type { Difficulty, Exercise, ExerciseGroup, ExerciseLog, Feeling, SetLog } from '../types';

// ─── Elapsed workout timer ────────────────────────────────────────────────────
// Uses the absolute start timestamp so background throttling can't skew it.
// Re-syncs immediately on tab focus via visibilitychange.

function useElapsedTime(startedAt: string | null | undefined): string {
  const anchorRef = useRef(startedAt ?? new Date().toISOString());
  if (startedAt) anchorRef.current = startedAt;

  const calc = () => Math.max(0, Math.floor((Date.now() - new Date(anchorRef.current).getTime()) / 1000));
  const [elapsed, setElapsed] = useState(calc);

  useEffect(() => {
    const tick = () => setElapsed(calc());
    tick();
    const id = setInterval(tick, 1000);
    // Re-sync instantly when user comes back from another app / tab
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Rest timer ───────────────────────────────────────────────────────────────
// No HTML Audio — any web-audio playback grabs the OS audio session and stops
// background music (Spotify, etc.) permanently. Instead we rely on:
//   • Vibration  for in-app haptic alert
//   • SW notification  for the system sound (OS notification tone briefly
//     ducks music then the OS resumes it automatically — no permanent cutoff)

const PRESETS = [30, 60, 90, 120, 180];

interface RestTimerHandle {
  remaining: number | null;
  total:     number;
  finished:  boolean;
  selected:  number;
  min:       string;
  sec:       string;
  setMin:    (v: string) => void;
  setSec:    (v: string) => void;
  start:     (secs: number) => void;
  stop:      () => void;
  dismiss:   () => void;
}

function useRestTimer(): RestTimerHandle {
  const [endTime,   setEndTime]   = useState<number | null>(null);
  const [total,     setTotal]     = useState(90);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [finished,  setFinished]  = useState(false);
  const [selected,  setSelected]  = useState(90);
  const [min,       setMin]       = useState('');
  const [sec,       setSec]       = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const calcRemaining = (end: number) => Math.max(0, Math.ceil((end - Date.now()) / 1000));

  const fireAlert = () => {
    if ('vibrate' in navigator) navigator.vibrate([400, 100, 400, 100, 400]);
  };

  const scheduleNotification = async (delayMs: number) => {
    if (!('Notification' in window) || !navigator.serviceWorker) return;
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'SCHEDULE_NOTIFICATION', delayMs });
  };

  const cancelNotification = () => {
    navigator.serviceWorker?.ready.then(reg =>
      reg.active?.postMessage({ type: 'CANCEL_NOTIFICATION' }),
    ).catch(() => {});
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setEndTime(null); setRemaining(null); setFinished(false);
    cancelNotification();
  };

  const start = (secs: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSelected(secs); setFinished(false);
    const end = Date.now() + secs * 1000;
    setEndTime(end); setTotal(secs); setRemaining(secs);
    scheduleNotification(secs * 1000).catch(() => {});
    intervalRef.current = setInterval(() => {
      const r = calcRemaining(end);
      if (r <= 0) {
        clearInterval(intervalRef.current!); setEndTime(null); setRemaining(null);
        cancelNotification(); setFinished(true); fireAlert();
      } else setRemaining(r);
    }, 250);
  };

  // Re-sync on visibility: handles the case where the app was backgrounded
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && endTime) {
        const r = calcRemaining(endTime);
        if (r <= 0) { cancelNotification(); stop(); setFinished(true); fireAlert(); }
        else setRemaining(r);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [endTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return { remaining, total, finished, selected, min, sec, setMin, setSec, start, stop, dismiss: () => setFinished(false) };
}

// ─── Session top bar ──────────────────────────────────────────────────────────
// Always sticky at the top of the page. Contains the workout title + elapsed
// clock on the first row, and the rest timer (in all states) on the second row.

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface SessionTopBarProps {
  workoutName: string;
  elapsed:     string;
  saveStatus:  SaveStatus;
  timer:       RestTimerHandle;
  onBack:      () => void;
}

function SessionTopBar({ workoutName, elapsed, saveStatus, timer, onBack }: SessionTopBarProps) {
  const { remaining, total, finished, selected, min, sec, start, stop, dismiss, setMin, setSec } = timer;
  const customTotal = (parseInt(min) || 0) * 60 + (parseInt(sec) || 0);
  const hasCustom   = customTotal > 0;
  const urgent      = remaining !== null && remaining <= 10;

  return (
    <div className="sticky top-0 z-50 bg-white shadow-sm">

      {/* ── Row 1: navigation + workout title + elapsed + save status ── */}
      <div className="h-[52px] flex items-center gap-2 px-3 border-b border-slate-100">
        <button
          onClick={onBack}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center text-slate-500 rounded-xl"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="flex-1 text-[16px] font-bold text-slate-900 truncate">{workoutName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saveStatus === 'pending' && <span className="text-[10px] text-slate-400">● unsaved</span>}
          {saveStatus === 'saving'  && <span className="text-[10px] text-primary-400 animate-pulse">↑ saving…</span>}
          {saveStatus === 'saved'   && <span className="text-[10px] text-green-500">☁ saved</span>}
          {saveStatus === 'error'   && <span className="text-[10px] text-red-400">⚠ save failed</span>}
          <span className="text-sm font-bold text-primary-500 tabular-nums">⏱ {elapsed}</span>
        </div>
      </div>

      {/* ── Row 2: rest timer ── */}
      {finished ? (
        /* Finished */
        <div className="px-4 py-2.5 flex items-center gap-3 bg-green-50 border-b-2 border-green-200">
          <span className="text-lg">✅</span>
          <p className="flex-1 text-sm font-bold text-green-700">Rest done!</p>
          <button onClick={dismiss} className="text-xs font-bold text-green-600 px-3 py-1 rounded-lg bg-green-100 active:bg-green-200">
            Dismiss
          </button>
        </div>
      ) : remaining !== null ? (
        /* Running */
        <div className={`px-4 py-2.5 flex items-center gap-3 border-b-2 ${urgent ? 'bg-red-50 border-red-300' : 'bg-indigo-50 border-indigo-200'}`}>
          <div className="relative w-10 h-10 flex-shrink-0">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke={urgent ? '#fecaca' : '#c7d2fe'} strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none"
                stroke={urgent ? '#ef4444' : '#6366f1'} strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 15}`}
                strokeDashoffset={`${2 * Math.PI * 15 * (1 - remaining / total)}`}
                strokeLinecap="round"
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${urgent ? 'text-red-500' : 'text-indigo-600'}`}>
              {remaining}
            </span>
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold ${urgent ? 'text-red-600' : 'text-indigo-700'}`}>
              {urgent ? 'Almost done!' : 'Resting…'}
            </p>
            <p className={`text-xs ${urgent ? 'text-red-400' : 'text-indigo-400'}`}>{remaining}s left</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => start(total)} className="text-xs font-semibold text-slate-500 px-2 py-1 rounded-lg hover:bg-white/60">Reset</button>
            <button onClick={stop} className={`text-xs font-bold px-3 py-1.5 rounded-lg text-white ${urgent ? 'bg-red-500' : 'bg-indigo-500'}`}>Skip</button>
          </div>
        </div>
      ) : (
        /* Idle */
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 space-y-2">
          {/* Preset buttons */}
          <div className="flex gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => { setMin(''); setSec(''); start(p); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all active:scale-95 ${
                  selected === p && !hasCustom
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 bg-white text-slate-500'}`}
              >
                {p >= 60 ? `${p / 60}m` : `${p}s`}
              </button>
            ))}
          </div>
          {/* Custom min / sec inputs */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number" inputMode="numeric" min="0" max="99" placeholder="0"
                value={min}
                onChange={e => setMin(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold text-center bg-white focus:outline-none focus:border-indigo-400"
              />
              <span className="text-xs text-slate-400 font-semibold">min</span>
            </div>
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number" inputMode="numeric" min="0" max="59" placeholder="0"
                value={sec}
                onChange={e => setSec(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold text-center bg-white focus:outline-none focus:border-indigo-400"
              />
              <span className="text-xs text-slate-400 font-semibold">sec</span>
            </div>
            {hasCustom && (
              <button
                onClick={() => start(customTotal)}
                className="px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-bold flex-shrink-0"
              >
                ▶
              </button>
            )}
          </div>
        </div>
      )}
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
  index:        number;
  set:          SetLog;
  lastSet:      SetLog | null;
  onUpdate:     (patch: Partial<SetLog>) => void;
  onRemove:     () => void;
  isUnilateral?: boolean;
}

function SetRow({ index, set, lastSet, onUpdate, onRemove, isUnilateral }: SetRowProps) {
  // For unilateral exercises: even index = Left, odd index = Right
  const sideLabel = isUnilateral ? (index % 2 === 0 ? 'L' : 'R') : String(index + 1);
  const sideColor = isUnilateral
    ? (index % 2 === 0 ? 'text-blue-500' : 'text-orange-500')
    : 'text-slate-400';

  return (
    <div className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-1.5 items-center mb-2">
      <span className={`text-xs font-bold text-center ${sideColor}`}>{sideLabel}</span>

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
  onEdit:      () => void;
}

function ExerciseBlock({ exercise, log, allWorkouts, onUpdateSet, onAddSet, onRemoveSet, onNoteChange, onEdit }: ExerciseBlockProps) {
  const lastWo  = allWorkouts.find(w => w.exercises.some(e => e.exerciseId === exercise.id));
  const lastLog = lastWo?.exercises.find(e => e.exerciseId === exercise.id) ?? null;
  const isUnilateral = log.isUnilateral ?? exercise.isUnilateral ?? false;

  const lastPerfText = lastLog?.sets.length
    ? lastLog.sets.map((s, i) => `S${i + 1}: ${s.weight ? s.weight + 'kg × ' : ''}${s.reps ?? '?'}${s.difficulty ? ` (${s.difficulty})` : ''}`).join(' · ')
    : 'First time — go for it!';

  return (
    <div className="py-3 px-4">
      <div className="flex items-center gap-2 mb-0.5">
        <p className="font-bold text-slate-900 flex-1">{log.exerciseName}</p>
        {isUnilateral && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">L/R</span>
        )}
        <button
          onClick={onEdit}
          title="Edit exercise"
          className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-primary-500 rounded-lg transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-0.5 mb-3">
        {lastWo ? `📅 ${daysAgo(lastWo.date)} · ` : ''}{lastPerfText}
      </p>

      {/* Column labels */}
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-1.5 mb-1">
        {[isUnilateral ? 'side' : '', 'kg', 'reps', 'feel', ''].map((l, i) => (
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
          isUnilateral={isUnilateral}
        />
      ))}

      <Button
        variant="ghost" size="sm" fullWidth
        onClick={isUnilateral ? () => { onAddSet(); onAddSet(); } : onAddSet}
        className="mt-1"
      >
        {isUnilateral ? '+ Add Round (L+R)' : '+ Add Set'}
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
  const upsertWorkout = useUpsertWorkout();
  const upsertPlan    = useUpsertPlan();
  const { data: allWorkouts = [] } = useWorkouts();
  const { workout, setWorkout, updateSet, addSet, removeSet, updateExerciseNote, setFeeling, setCardio, setNotes, renameExercise } = useActiveWorkout();
  const elapsed = useElapsedTime(workout?.startedAt);
  const timer   = useRestTimer();

  // Exercise edit modal state
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [editName,    setEditName]    = useState('');

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  useEffect(() => {
    if (!workout) return;
    setSaveStatus('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await upsertWorkout.mutateAsync({ ...workout, date: workout.startedAt ?? new Date().toISOString() });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 15_000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [workout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load plan for "Update plan" path — must be called before any early return
  const plan = usePlan(workout?.planId ?? '');

  if (!workout) {
    navigate('/log', { replace: true });
    return null;
  }

  const openEditExercise = (exId: string, currentName: string) => {
    setEditingExId(exId);
    setEditName(currentName);
  };

  const applyExerciseEdit = (scope: 'workout' | 'plan') => {
    if (!editingExId) return;
    const trimmed = editName.trim();
    if (!trimmed) { setEditingExId(null); return; }

    // Always update the in-progress workout
    renameExercise(editingExId, trimmed);

    if (scope === 'plan' && plan) {
      const updatedPlan = {
        ...plan,
        workouts: plan.workouts.map(w =>
          w.id === workout.workoutTemplateId
            ? { ...w, exercises: w.exercises.map(ex => ex.id === editingExId ? { ...ex, name: trimmed } : ex) }
            : w,
        ),
      };
      upsertPlan.mutate(updatedPlan);
    }
    setEditingExId(null);
  };

  // Reconstruct Exercise objects from the log for grouping
  const exercisesForGrouping: Exercise[] = workout.exercises.map(e => ({
    id:              e.exerciseId,
    name:            e.exerciseName,
    defaultSets:     e.sets.length,
    defaultReps:     '',
    supersetGroupId: e.supersetGroupId ?? null,
    isUnilateral:    e.isUnilateral ?? false,
  }));

  const finish = async () => {
    const hasData = workout.exercises.some(e => e.sets.some(s => s.weight || s.reps));
    if (!hasData && !confirm('No sets logged yet. Save anyway?')) return;
    // Cancel any pending auto-save and do a final upsert with the real finish date
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await upsertWorkout.mutateAsync({ ...workout, date: new Date().toISOString() });
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
      <SessionTopBar
        workoutName={workout.workoutTemplateName}
        elapsed={elapsed}
        saveStatus={saveStatus}
        timer={timer}
        onBack={() => navigate(-1)}
      />

      <div className="p-4 space-y-5 pb-8">
        {/* Plan name */}
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">{workout.planName}</p>

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
            {groupExercises(exercisesForGrouping).map((group: ExerciseGroup, gi: number) => {
              if (group.type === 'superset') {
                return (
                  <div key={gi} className="border-2 border-primary-500 rounded-2xl overflow-hidden">
                    <div className="bg-primary-50 px-4 py-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary-500">⚡ Superset</span>
                    </div>
                    {group.exercises.map((ex, ei) => {
                      const log = workout.exercises.find(l => l.exerciseId === ex.id)!;
                      return (
                        <div key={ex.id} className={ei < group.exercises.length - 1 ? 'border-b border-primary-200' : ''}>
                          <ExerciseBlock
                            exercise={ex}
                            log={log}
                            allWorkouts={allWorkouts}
                            onUpdateSet={(i, patch) => updateSet(log.exerciseId, i, patch)}
                            onAddSet={() => addSet(log.exerciseId)}
                            onRemoveSet={i => removeSet(log.exerciseId, i)}
                            onNoteChange={note => updateExerciseNote(log.exerciseId, note)}
                            onEdit={() => openEditExercise(ex.id, log.exerciseName)}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }
              const ex  = group.exercises[0];
              const log = workout.exercises.find(l => l.exerciseId === ex.id)!;
              return (
                <div key={gi} className="bg-white rounded-2xl shadow-sm">
                  <ExerciseBlock
                    exercise={ex}
                    log={log}
                    allWorkouts={allWorkouts}
                    onUpdateSet={(i, patch) => updateSet(log.exerciseId, i, patch)}
                    onAddSet={() => addSet(log.exerciseId)}
                    onRemoveSet={i => removeSet(log.exerciseId, i)}
                    onNoteChange={note => updateExerciseNote(log.exerciseId, note)}
                    onEdit={() => openEditExercise(ex.id, log.exerciseName)}
                  />
                </div>
              );
            })}
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

        <Button fullWidth size="lg" loading={upsertWorkout.isPending} onClick={finish}>
          ✓ Finish Workout
        </Button>
        <Button fullWidth variant="ghost" size="sm" onClick={discard}>
          Discard Workout
        </Button>
      </div>

      {/* ── Edit exercise modal ── */}
      {editingExId && (
        <Modal title="Edit Exercise" onClose={() => setEditingExId(null)}>
          <div className="space-y-4">
            <Input
              label="Exercise name"
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyExerciseEdit('workout')}
            />
            <p className="text-xs text-slate-400">Apply this change to:</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => applyExerciseEdit('workout')}
                className="py-3 px-4 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 active:bg-slate-50 transition-colors"
              >
                <p>This workout</p>
                <p className="text-[11px] font-normal text-slate-400 mt-0.5">Only today's session</p>
              </button>
              <button
                onClick={() => applyExerciseEdit('plan')}
                disabled={!plan}
                className="py-3 px-4 rounded-2xl bg-primary-500 text-white text-sm font-bold active:bg-primary-600 transition-colors disabled:opacity-50"
              >
                <p>Update plan</p>
                <p className="text-[11px] font-normal text-primary-200 mt-0.5">Saves to template</p>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
