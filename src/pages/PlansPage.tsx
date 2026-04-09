import { useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlans, useUpsertPlan } from '../hooks/usePlans';
import { useActivePlanId, useSetActivePlanId } from '../hooks/useSettings';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/Modal';
import { Header, HeaderAddButton } from '../components/layout/Header';
import { uid } from '../utils';
import type { Plan, WorkoutTemplate } from '../types';

// ─── Plan file parser ─────────────────────────────────────────────────────────
//
// Supports two formats:
//
// 1. Plain-text (.txt)  — human-writable, one plan per file:
//
//    My 3-Day Split
//
//    Push Day
//    Bench Press 4x8-12
//    Overhead Press 3x10
//    Tricep Pushdown 3x12-15
//
//    Pull Day
//    Deadlift 4x5
//    Pull-up 3x8
//
//    Legs
//    Squat 4x6-8
//    Romanian Deadlift 3x10
//
//    Rules:
//    • First non-empty line → plan name
//    • Lines matching "Name NxReps" → exercises added to the current workout
//    • Any other non-empty line → starts a new workout section
//
// 2. JSON (.json) — the app's own export format (single plan or full backup)

type ParsedPlan = Omit<Plan, 'id'>;

function parseTextPlan(text: string): ParsedPlan {
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
  const planName = lines[0] ?? 'Imported Plan';

  const workouts: WorkoutTemplate[] = [];
  let   current: WorkoutTemplate | null = null;

  // "Bench Press 4x8-12"  or  "Squat 4×6"
  const exerciseRe = /^(.+?)\s+(\d+)[x×](\S+)\s*$/i;

  for (let i = 1; i < lines.length; i++) {
    const line  = lines[i];
    const match = line.match(exerciseRe);

    if (match) {
      // Exercise line — lazy-create a workout if none exists yet
      if (!current) {
        current = { id: uid(), name: 'Workout', exercises: [] };
        workouts.push(current);
      }
      current.exercises.push({
        id:              uid(),
        name:            match[1].trim(),
        defaultSets:     parseInt(match[2]) || 3,
        defaultReps:     match[3],
        supersetGroupId: null,
      });
    } else {
      // Workout section header
      current = { id: uid(), name: line, exercises: [] };
      workouts.push(current);
    }
  }

  return { name: planName, workouts };
}

function parseJsonPlan(text: string): ParsedPlan | null {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    // Single plan: { name, workouts }
    if (typeof data.name === 'string' && Array.isArray(data.workouts)) {
      return { name: data.name, workouts: data.workouts as WorkoutTemplate[] };
    }
    // Full backup: { plans: [...] } — import the first plan
    if (Array.isArray((data as { plans?: unknown[] }).plans) && (data as { plans: unknown[] }).plans.length > 0) {
      const first = (data as { plans: Plan[] }).plans[0];
      return { name: first.name, workouts: first.workouts };
    }
  } catch { /* fall through */ }
  return null;
}

function parsePlanFile(text: string, fileName: string): ParsedPlan | null {
  if (fileName.toLowerCase().endsWith('.json')) {
    return parseJsonPlan(text);
  }
  return parseTextPlan(text);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlansPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { data: plans = [],   isLoading } = usePlans();
  const { data: activePlanId }            = useActivePlanId();
  const upsertPlan                        = useUpsertPlan();
  const setActivePlan                     = useSetActivePlanId();

  // ── Create modal ──
  const [showModal, setShowModal] = useState(false);
  const [newName,   setNewName]   = useState('');

  // ── Import modal ──
  const importFileRef                         = useRef<HTMLInputElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedPlan,      setParsedPlan]      = useState<ParsedPlan | null>(null);
  const [importName,      setImportName]      = useState('');
  const [importError,     setImportError]     = useState('');
  const [importSaved,     setImportSaved]     = useState(false);

  // Auto-open create modal when navigated here with openCreate state (e.g. from Dashboard)
  useEffect(() => {
    if ((location.state as { openCreate?: boolean } | null)?.openCreate) {
      setShowModal(true);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const createPlan = async () => {
    if (!newName.trim()) return;
    const plan = { id: uid(), name: newName.trim(), workouts: [] };
    await upsertPlan.mutateAsync(plan);
    if (!activePlanId) await setActivePlan.mutateAsync(plan.id);
    setShowModal(false);
    setNewName('');
    navigate(`/plans/${plan.id}`);
  };

  // ── Import handlers ──

  const openImportPicker = () => {
    setImportError('');
    importFileRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const plan = parsePlanFile(text, file.name);
      if (!plan) {
        setImportError('Could not read this file. Check the format and try again.');
        return;
      }
      setParsedPlan(plan);
      setImportName(plan.name);
      setImportError('');
      setImportSaved(false);
      setShowImportModal(true);
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-selecting same file
  };

  const confirmImport = async () => {
    if (!parsedPlan) return;
    const plan: Plan = { id: uid(), name: importName.trim() || parsedPlan.name, workouts: parsedPlan.workouts };
    await upsertPlan.mutateAsync(plan);
    if (!activePlanId) await setActivePlan.mutateAsync(plan.id);
    setImportSaved(true);
    setTimeout(() => {
      setShowImportModal(false);
      setParsedPlan(null);
      navigate(`/plans/${plan.id}`);
    }, 800);
  };

  const totalExercises = parsedPlan?.workouts.reduce((n, w) => n + w.exercises.length, 0) ?? 0;

  return (
    <>
      <Header
        title="My Plans"
        action={
          <>
            {/* Load Plan from File */}
            <button
              onClick={openImportPicker}
              title="Load Plan from File"
              className="w-9 h-9 flex items-center justify-center text-slate-500 rounded-xl hover:text-primary-500"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[18px] h-[18px]">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
            <HeaderAddButton onClick={() => setShowModal(true)} />
          </>
        }
      />

      {/* Hidden file input — accepts .txt and .json */}
      <input
        ref={importFileRef}
        type="file"
        accept=".txt,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="p-4">
        {importError && (
          <p className="bg-red-50 text-red-500 text-sm px-3 py-2 rounded-xl mb-4">{importError}</p>
        )}

        {isLoading ? <Spinner /> : plans.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-bold text-slate-900 mb-1">No plans yet</p>
            <p className="text-sm text-slate-500 mb-5">Create a plan or load one from a file</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setShowModal(true)}>Create Plan</Button>
              <Button variant="outline" onClick={openImportPicker}>Load from File</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map(plan => {
              const isActive = plan.id === activePlanId;
              return (
                <div key={plan.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-easy' : 'bg-transparent'}`} />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/plans/${plan.id}`)}
                  >
                    <p className="font-bold text-slate-900">{plan.name}</p>
                    <p className="text-sm text-slate-400">
                      {plan.workouts.length} workout{plan.workouts.length !== 1 ? 's' : ''}
                      {isActive ? ' · Active' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setActivePlan.mutate(plan.id)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-easy-light text-easy border-easy'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    {isActive ? '✓ Active' : 'Set Active'}
                  </button>
                  <button onClick={() => navigate(`/plans/${plan.id}`)} className="text-slate-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create plan modal ── */}
      {showModal && (
        <Modal title="New Plan" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <Input
              label="Plan Name"
              placeholder="e.g. 3 Month Strength Program"
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPlan()}
            />
            <Button fullWidth loading={upsertPlan.isPending} onClick={createPlan}>
              Create Plan
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Import preview modal ── */}
      {showImportModal && parsedPlan && (
        <Modal title="Load Plan from File" onClose={() => { setShowImportModal(false); setParsedPlan(null); }}>
          <div className="space-y-4">

            {/* Summary */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Detected</p>
              <p className="text-sm font-semibold text-slate-700">
                {parsedPlan.workouts.length} workout{parsedPlan.workouts.length !== 1 ? 's' : ''} · {totalExercises} exercise{totalExercises !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {parsedPlan.workouts.map((w, i) => (
                  <div key={i}>
                    <p className="text-xs font-bold text-slate-600 mt-1">{w.name}</p>
                    {w.exercises.map((ex, j) => (
                      <p key={j} className="text-xs text-slate-400 pl-2">
                        · {ex.name} — {ex.defaultSets}×{ex.defaultReps}
                      </p>
                    ))}
                  </div>
                ))}
                {parsedPlan.workouts.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No workouts found in file</p>
                )}
              </div>
            </div>

            {/* Rename before saving */}
            <Input
              label="Plan Name"
              autoFocus
              value={importName}
              onChange={e => setImportName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !importSaved && confirmImport()}
            />

            <Button
              fullWidth
              loading={upsertPlan.isPending}
              onClick={confirmImport}
            >
              {importSaved ? '✓ Saved!' : 'Load Plan'}
            </Button>

            {/* Format hint */}
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer font-semibold hover:text-slate-600 select-none">
                How to format a .txt file
              </summary>
              <pre className="mt-2 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-mono text-[11px]">{`My Strength Plan

Push Day
Bench Press 4x8-12
Overhead Press 3x10
Tricep Pushdown 3x12-15

Pull Day
Deadlift 4x5
Pull-up 3x8
Bicep Curl 3x10

Legs
Squat 4x6-8
Romanian Deadlift 3x10
Calf Raise 4x20`}
              </pre>
              <p className="mt-2">
                First line = plan name. Section headers start new workouts. Exercise lines use <code className="bg-slate-100 px-1 rounded">Name NxReps</code> format.
              </p>
            </details>
          </div>
        </Modal>
      )}
    </>
  );
}
