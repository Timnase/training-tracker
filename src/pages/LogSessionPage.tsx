import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveWorkout } from '../hooks/useActiveWorkout';
import { useUpsertWorkout } from '../hooks/useWorkouts';
import { useWorkouts } from '../hooks/useWorkouts';
import { usePlan, useUpsertPlan } from '../hooks/usePlans';
import { Header } from '../components/layout/Header';
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

// ─── Rest timer sound ─────────────────────────────────────────────────────────
// Generate a 3-beep WAV as a blob URL once at module load.
// Using HTML <Audio> instead of Web Audio API: iOS blocks AudioContext nodes
// created outside a user gesture even after resume(), but an <Audio> element
// that was play()-ed (even silently) during a gesture can replay freely.

function _makeBeepUrl(): string {
  try {
    const sr = 8000;
    const notes: Array<[number, number, number]> = [
      [0,    523.25, 0.20], // C5
      [0.22, 659.25, 0.20], // E5
      [0.44, 783.99, 0.35], // G5
    ];
    const totalSecs = 0.85;
    const n = Math.ceil(sr * totalSecs);
    const pcm = new Float32Array(n);
    for (const [t0, freq, dur] of notes) {
      const s0 = Math.floor(t0 * sr);
      const sn = Math.floor(dur * sr);
      for (let i = 0; i < sn && s0 + i < n; i++) {
        const env = Math.min(i / (sr * 0.01), 1) * Math.min((sn - i) / (sr * 0.02), 1);
        pcm[s0 + i] += 0.5 * Math.sin(2 * Math.PI * freq * i / sr) * env;
      }
    }
    const samples = new Int16Array(n);
    for (let i = 0; i < n; i++) samples[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
    const dataLen = samples.byteLength;
    const buf = new ArrayBuffer(44 + dataLen);
    const dv  = new DataView(buf);
    dv.setUint32( 0, 0x52494646, false); // "RIFF"
    dv.setUint32( 4, 36 + dataLen, true);
    dv.setUint32( 8, 0x57415645, false); // "WAVE"
    dv.setUint32(12, 0x666d7420, false); // "fmt "
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1,  true);           // PCM
    dv.setUint16(22, 1,  true);           // mono
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2, true);       // byteRate
    dv.setUint16(32, 2,  true);           // blockAlign
    dv.setUint16(34, 16, true);           // bitsPerSample
    dv.setUint32(36, 0x64617461, false);  // "data"
    dv.setUint32(40, dataLen, true);
    new Int16Array(buf, 44).set(samples);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  } catch { return ''; }
}
const BEEP_URL = _makeBeepUrl();

// ─── Rest timer ───────────────────────────────────────────────────────────────
// Uses an absolute endTime so the countdown stays accurate even when the
// browser throttles intervals in the background.

const PRESETS = [30, 60, 90, 120, 180];

function RestTimer() {
  const [endTime,    setEndTime]    = useState<number | null>(null); // absolute ms timestamp
  const [total,      setTotal]      = useState(90);
  const [remaining,  setRemaining]  = useState<number | null>(null);
  const [finished,   setFinished]   = useState(false); // show "done" flash when returning from bg
  const [selected,   setSelected]   = useState(90);
  const [customMin,  setCustomMin]  = useState('');
  const [customSec,  setCustomSec]  = useState('');
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Audio element — created lazily inside gesture handler so it's already unlocked for iOS
  const audioRef     = useRef<HTMLAudioElement | null>(null);

  const calcRemaining = (end: number) => Math.max(0, Math.ceil((end - Date.now()) / 1000));

  const playBeep = () => {
    // Vibrate — works reliably on Android/iOS regardless of audio focus
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
    // Audio beep — may silently fail on iOS if gesture unlock wasn't granted
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.volume = 1;
    a.play().catch(() => {});
    // When the beep finishes, release the audio session by clearing the src.
    // This signals the OS that our audio is done and allows interrupted apps
    // (e.g. Spotify) to resume playback automatically.
    a.onended = () => {
      a.src = '';
      audioRef.current = null; // recreated on next start() gesture
    };
  };

  // ── Service-worker notification helpers ──────────────────────────────────
  // Posts a message to the SW so it can fire a local notification even when
  // the browser has throttled the page's JS (app in background).
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

  const start = (secs: number) => {
    // Create the audio element inside the gesture so browsers permit future play() calls.
    // Do NOT call a.load() — that activates the iOS audio session immediately and
    // interrupts background music in other apps during the countdown.
    if (BEEP_URL && !audioRef.current) {
      audioRef.current = new Audio(BEEP_URL);
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    setFinished(false);
    const end = Date.now() + secs * 1000;
    setEndTime(end); setTotal(secs); setRemaining(secs);
    scheduleNotification(secs * 1000).catch(() => {});
    intervalRef.current = setInterval(() => {
      const r = calcRemaining(end);
      if (r <= 0) {
        clearInterval(intervalRef.current!); setEndTime(null); setRemaining(null);
        cancelNotification();
        playBeep();
      } else setRemaining(r);
    }, 250); // poll 4× per second for accuracy
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setEndTime(null); setRemaining(null); setFinished(false);
    cancelNotification();
  };

  // Re-sync when returning from background (browser throttles intervals)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && endTime) {
        const r = calcRemaining(endTime);
        if (r <= 0) { cancelNotification(); stop(); setFinished(true); playBeep(); } else setRemaining(r);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [endTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // ── Timer finished while app was in background ──
  if (finished) {
    return (
      <div className="rounded-xl p-3 flex items-center gap-3 bg-easy-light border border-easy">
        <span className="text-2xl">✅</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-easy">Rest done!</p>
          <p className="text-xs text-slate-500">Timer finished while you were away</p>
        </div>
        <button onClick={() => setFinished(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Dismiss</button>
      </div>
    );
  }

  // ── Running ──
  if (remaining !== null) {
    const pct    = (remaining / total) * 100;
    const urgent = remaining <= 10;
    return (
      <div className={`rounded-xl p-3 flex items-center gap-3 ${urgent ? 'bg-red-50' : 'bg-primary-50'}`}>
        <div className="relative w-12 h-12 flex-shrink-0">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none"
              stroke={urgent ? '#ef4444' : '#6366f1'} strokeWidth="3"
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
          <p className="text-xs text-slate-400">{remaining}s left</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => start(total)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Reset</button>
          <button onClick={stop}              className="text-xs font-semibold text-primary-500 hover:text-primary-700">Skip</button>
        </div>
      </div>
    );
  }

  // ── Idle: tap a preset to start instantly, or enter custom min/sec ──
  const customTotal = (parseInt(customMin) || 0) * 60 + (parseInt(customSec) || 0);
  const hasCustom   = customTotal > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 text-center">Rest Timer — tap to start</p>
      <div className="flex gap-1.5">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => { setSelected(p); setCustomMin(''); setCustomSec(''); start(p); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all active:scale-95
              ${selected === p && !hasCustom
                ? 'border-primary-500 bg-primary-50 text-primary-600'
                : 'border-slate-200 text-slate-500 hover:border-primary-300'}`}
          >
            {p >= 60 ? `${p / 60}m` : `${p}s`}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <div className="flex-1 flex gap-1 items-center">
          <input
            type="number" inputMode="numeric" min="0" max="59" placeholder="0"
            value={customMin}
            onChange={e => setCustomMin(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-sm text-center focus:outline-none focus:border-primary-500"
          />
          <span className="text-xs text-slate-400 font-semibold flex-shrink-0">min</span>
          <input
            type="number" inputMode="numeric" min="0" max="59" placeholder="0"
            value={customSec}
            onChange={e => setCustomSec(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-sm text-center focus:outline-none focus:border-primary-500"
          />
          <span className="text-xs text-slate-400 font-semibold flex-shrink-0">sec</span>
        </div>
        {hasCustom && (
          <button
            onClick={() => { setSelected(-1); start(customTotal); }}
            className="px-3 py-1.5 rounded-xl bg-primary-500 text-white text-sm font-bold flex-shrink-0"
          >
            ▶ {customMin ? `${customMin}m` : ''}{customSec ? `${customSec}s` : ''}
          </button>
        )}
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

  // Exercise edit modal state
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [editName,    setEditName]    = useState('');

  // Cloud auto-save: debounce 15 s after last change, then upsert to Supabase.
  // Status: 'idle' → 'pending' (debounce running) → 'saving' → 'saved' | 'error'
  type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
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
      <Header title={workout.workoutTemplateName} showBack />

      <div className="p-4 space-y-5 pb-8">
        {/* Plan name + elapsed timer + cloud save indicator */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">{workout.planName}</p>
          <div className="flex items-center gap-3">
            {saveStatus === 'pending' && (
              <span className="text-[10px] text-slate-400">● unsaved</span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-[10px] text-primary-400 animate-pulse">↑ saving…</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-green-500">☁ saved</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-[10px] text-red-400" title="Auto-save failed">⚠ save failed</span>
            )}
            <span className="text-sm font-bold text-primary-500 tabular-nums">⏱ {elapsed}</span>
          </div>
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
