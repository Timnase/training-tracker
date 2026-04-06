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
  const [endTime,   setEndTime]   = useState<number | null>(null); // absolute ms timestamp
  const [total,     setTotal]     = useState(90);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [custom,    setCustom]    = useState('');
  const [selected,  setSelected]  = useState(90);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // HTML Audio element — unlocked (via silent play) inside the user's tap gesture
  const audioRef    = useRef<HTMLAudioElement | null>(null);

  const calcRemaining = (end: number) => Math.max(0, Math.ceil((end - Date.now()) / 1000));

  // Must be called inside a tap handler so iOS allows future .play() calls
  const unlockAudio = () => {
    if (!BEEP_URL) return;
    const a = new Audio(BEEP_URL);
    a.volume = 0.001; // near-silent so user doesn't hear it
    a.play().catch(() => {});
    audioRef.current = a;
  };

  const playBeep = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.volume = 1;
    audioRef.current.play().catch(() => {});
  };

  const start = (secs: number) => {
    unlockAudio(); // inside tap handler — iOS gesture unlock
    if (intervalRef.current) clearInterval(intervalRef.current);
    const end = Date.now() + secs * 1000;
    setEndTime(end); setTotal(secs); setRemaining(secs);
    intervalRef.current = setInterval(() => {
      const r = calcRemaining(end);
      if (r <= 0) {
        clearInterval(intervalRef.current!); setEndTime(null); setRemaining(null);
        playBeep();
      } else setRemaining(r);
    }, 250); // poll 4× per second for accuracy
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setEndTime(null); setRemaining(null);
  };

  // Re-sync when returning from background (background throttles intervals)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && endTime) {
        const r = calcRemaining(endTime);
        if (r <= 0) { stop(); playBeep(); } else setRemaining(r);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [endTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

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

  // ── Idle: tap a preset to start instantly, or type custom ──
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 text-center">Rest Timer — tap to start</p>
      <div className="flex gap-1.5">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => { setSelected(p); setCustom(''); start(p); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all active:scale-95
              ${selected === p && !custom
                ? 'border-primary-500 bg-primary-50 text-primary-600'
                : 'border-slate-200 text-slate-500 hover:border-primary-300'}`}
          >
            {p >= 60 ? `${p / 60}m` : `${p}s`}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number" min="5" max="600" placeholder="Custom sec"
          value={custom}
          onChange={e => { setCustom(e.target.value); if (e.target.value) setSelected(parseInt(e.target.value)); }}
          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-sm text-center focus:outline-none focus:border-primary-500"
        />
        {custom && (
          <button
            onClick={() => start(parseInt(custom) || 90)}
            className="px-4 py-1.5 rounded-xl bg-primary-500 text-white text-sm font-bold"
          >
            ▶ {custom}s
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

  // Auto-save indicator — workout is already saved to localStorage on every change
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => {
    if (!workout) return;
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(t);
  }, [workout]);

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
        {/* Plan name + elapsed timer + auto-save indicator */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">{workout.planName}</p>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-semibold transition-opacity duration-500 ${savedFlash ? 'text-green-500 opacity-100' : 'opacity-0'}`}>
              ✓ Saved
            </span>
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
