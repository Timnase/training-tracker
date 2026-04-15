import { useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlans, useUpsertPlan } from '../hooks/usePlans';
import { useActivePlanId, useSetActivePlanId } from '../hooks/useSettings';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/Modal';
import { Header } from '../components/layout/Header';
import { supabase } from '../lib/supabase';
import { uid } from '../utils';
import type { Plan, WorkoutTemplate } from '../types';

// ─── Plan file parser ─────────────────────────────────────────────────────────

type ParsedPlan = Omit<Plan, 'id'>;

const EXAMPLE_PLAN_TEXT = `My 3-Day Split

Push Day
Bench Press 4x8-12
Overhead Press 3x10
Lateral Raise 3x15
Tricep Pushdown 3x12-15

Pull Day
Deadlift 4x5
Pull-up 3x8-12
Barbell Row 3x8
Bicep Curl 3x10

Legs
Squat 4x6-8
Romanian Deadlift 3x10
Leg Press 3x12-15
Calf Raise 4x20`;

function parseTextPlan(text: string): ParsedPlan {
  const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
  const planName = lines[0] ?? 'Imported Plan';
  const workouts: WorkoutTemplate[] = [];
  let   current: WorkoutTemplate | null = null;
  const exerciseRe = /^(.+?)\s+(\d+)[x×](\S+)\s*$/i;

  for (let i = 1; i < lines.length; i++) {
    const line  = lines[i];
    const match = line.match(exerciseRe);
    if (match) {
      if (!current) {
        current = { id: uid(), name: 'Workout', exercises: [] };
        workouts.push(current);
      }
      current.exercises.push({
        id: uid(), name: match[1].trim(),
        defaultSets: parseInt(match[2]) || 3, defaultReps: match[3],
        supersetGroupId: null,
      });
    } else {
      current = { id: uid(), name: line, exercises: [] };
      workouts.push(current);
    }
  }
  return { name: planName, workouts };
}

function parseJsonPlan(text: string): ParsedPlan | null {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (typeof data.name === 'string' && Array.isArray(data.workouts))
      return { name: data.name, workouts: data.workouts as WorkoutTemplate[] };
    if (Array.isArray((data as { plans?: unknown[] }).plans) && (data as { plans: unknown[] }).plans.length > 0) {
      const first = (data as { plans: Plan[] }).plans[0];
      return { name: first.name, workouts: first.workouts };
    }
  } catch { /* fall through */ }
  return null;
}

function parsePlanFile(text: string, fileName: string): ParsedPlan | null {
  if (fileName.toLowerCase().endsWith('.json')) return parseJsonPlan(text);
  return parseTextPlan(text);
}

// ─── Image → plan via Claude Vision ──────────────────────────────────────────
// Calls the `scan-image` Supabase Edge Function, which holds the Anthropic API
// key server-side as a Supabase Secret (never bundled into client JS).
// Only JPEG / PNG / GIF / WebP are accepted — validated before the call.

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// ─── Format guide modal ───────────────────────────────────────────────────────

function FormatGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="File Format Guide" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Create a <code className="bg-slate-100 px-1 rounded text-xs">.txt</code> file
          with this structure and tap <strong>Load from file</strong>:
        </p>
        <pre className="bg-slate-50 rounded-xl p-4 text-[12px] font-mono whitespace-pre-wrap text-slate-700 leading-relaxed border border-slate-200">
          {EXAMPLE_PLAN_TEXT}
        </pre>
        <ul className="space-y-1.5 text-xs text-slate-500">
          <li>• <span className="font-semibold text-slate-700">First line</span> → plan name</li>
          <li>• <span className="font-semibold text-slate-700">Section headings</span> (no <code className="bg-slate-100 px-0.5 rounded">NxReps</code>) → workout names</li>
          <li>• <span className="font-semibold text-slate-700">Exercise lines</span> use <code className="bg-slate-100 px-0.5 rounded">Name NxReps</code> format, e.g. <code className="bg-slate-100 px-0.5 rounded">Squat 4x8</code></li>
        </ul>
        <p className="text-xs text-slate-400">
          Also accepts <code className="bg-slate-100 px-0.5 rounded">.json</code> files exported from this app.
        </p>
      </div>
    </Modal>
  );
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

  // ── Format guide modal ──
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  // ── Image scan ──
  const imageFileRef                      = useRef<HTMLInputElement>(null);
  const [imageScanning, setImageScanning] = useState(false);
  const [imageError,    setImageError]    = useState('');

  // ── Paste text ──
  const [showTextModal, setShowTextModal] = useState(false);
  const [pastedText,    setPastedText]    = useState('');
  const [textError,     setTextError]     = useState('');

  // Auto-open create modal when navigated here with openCreate state
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
  const openImportPicker = () => { setImportError(''); importFileRef.current?.click(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const plan = parsePlanFile(text, file.name);
      if (!plan) { setImportError('Could not read this file. Check the format and try again.'); return; }
      setParsedPlan(plan); setImportName(plan.name); setImportError(''); setImportSaved(false); setShowImportModal(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!parsedPlan) return;
    const plan: Plan = { id: uid(), name: importName.trim() || parsedPlan.name, workouts: parsedPlan.workouts };
    await upsertPlan.mutateAsync(plan);
    if (!activePlanId) await setActivePlan.mutateAsync(plan.id);
    setImportSaved(true);
    setTimeout(() => { setShowImportModal(false); setParsedPlan(null); navigate(`/plans/${plan.id}`); }, 800);
  };

  const totalExercises = parsedPlan?.workouts.reduce((n, w) => n + w.exercises.length, 0) ?? 0;

  const openTextModal = () => {
    setPastedText(EXAMPLE_PLAN_TEXT);
    setTextError('');
    setShowTextModal(true);
  };

  const confirmPastedText = () => {
    if (!pastedText.trim()) { setTextError('Please enter some text first.'); return; }
    const plan = parseTextPlan(pastedText);
    if (!plan.workouts.length) {
      setTextError('No workouts found. Add a day heading (e.g. "Push Day") before listing exercises.');
      return;
    }
    const exerciseCount = plan.workouts.reduce((n, w) => n + w.exercises.length, 0);
    if (exerciseCount === 0) {
      setTextError('No exercises found. Each exercise line must follow the format: "Bench Press 4x8".');
      return;
    }
    setParsedPlan(plan); setImportName(plan.name); setImportSaved(false);
    setShowTextModal(false);
    setShowImportModal(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Validate mime type before reading — only send known image formats to the API
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageError('Unsupported image type. Please use JPG, PNG, GIF, or WebP.');
      return;
    }

    setImageError('');
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      // dataUrl = "data:<mimeType>;base64,<data>"
      const [meta, base64] = dataUrl.split(',');
      const mimeType = meta.replace('data:', '').replace(';base64', '') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

      // Second guard: ensure the data-URL mime type is also in the allowed set
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        setImageError('Unsupported image format. Please use JPG, PNG, GIF, or WebP.');
        return;
      }

      setImageScanning(true);
      try {
        const { data, error } = await supabase.functions.invoke('scan-image', {
          body: { base64, mimeType },
        });
        if (error) throw error;
        const text: string = (data?.text ?? '').trim();
        if (!text || text === 'NO_PLAN_FOUND') {
          setImageError('No workout plan detected in this image. Try a clearer screenshot.');
          return;
        }
        const plan = parseTextPlan(text);
        if (!plan.workouts.length) {
          setImageError('No workout plan detected in this image. Try a clearer screenshot.');
          return;
        }
        setParsedPlan(plan); setImportName(plan.name); setImportSaved(false); setShowImportModal(true);
      } catch (err) {
        setImageError(`Image scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setImageScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <Header title="My Plans" />

      {/* Hidden file inputs */}
      <input ref={importFileRef} type="file" accept=".txt,.json" className="hidden" onChange={handleFileChange} />
      <input ref={imageFileRef}  type="file" accept="image/*"    className="hidden" onChange={handleImageChange} />

      <div className="p-4 pb-2">
        {(importError || imageError) && (
          <p className="bg-red-50 text-red-500 text-sm px-3 py-2 rounded-xl mb-4">{importError || imageError}</p>
        )}

        {isLoading ? (
          <Spinner />
        ) : plans.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">📋</p>
            <p className="font-bold text-slate-900 mb-1">No plans yet</p>
            <p className="text-sm text-slate-500">Use the buttons below to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map(plan => {
              const isActive = plan.id === activePlanId;
              return (
                <div key={plan.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-easy' : 'bg-transparent'}`} />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/plans/${plan.id}`)}>
                    <p className="font-bold text-slate-900">{plan.name}</p>
                    <p className="text-sm text-slate-400">
                      {plan.workouts.length} workout{plan.workouts.length !== 1 ? 's' : ''}
                      {isActive ? ' · Active' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setActivePlan.mutate(plan.id)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                      isActive ? 'bg-easy-light text-easy border-easy' : 'bg-slate-50 text-slate-400 border-slate-200'
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

      {/* ── Sticky action bar ─────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 py-3 space-y-2.5">

        {/* Row 1: Create new  +  Load from file */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Create new plan */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-primary-500 text-white shadow-sm active:scale-[0.97] transition-transform"
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold leading-tight">Create new</p>
              <p className="text-[11px] text-primary-200 leading-tight mt-0.5">Start from scratch</p>
            </div>
          </button>

          {/* Load plan from file + ? badge */}
          <div className="relative">
            <button
              onClick={openImportPicker}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-primary-500 text-primary-600 active:scale-[0.97] transition-transform"
            >
              <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-bold leading-tight">Load from file</p>
                <p className="text-[11px] text-primary-400 leading-tight mt-0.5">.txt or .json</p>
              </div>
            </button>
            {/* ? format guide badge */}
            <button
              onClick={e => { e.stopPropagation(); setShowFormatGuide(true); }}
              title="Show file format guide"
              className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 text-[11px] font-bold flex items-center justify-center shadow-sm transition-colors z-10"
            >?</button>
          </div>
        </div>

        {/* Row 2: Paste text  +  Scan image */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Paste text with template */}
          <button
            onClick={openTextModal}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors active:scale-[0.98]"
          >
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-xs font-bold leading-tight">Paste text</p>
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">Edit a template</p>
            </div>
          </button>

          {/* Scan image */}
          <button
            onClick={() => { setImageError(''); imageFileRef.current?.click(); }}
            disabled={imageScanning}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-primary-400 hover:text-primary-600 transition-colors active:scale-[0.98] disabled:opacity-60"
          >
            {imageScanning ? (
              <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center">
                <svg className="animate-spin w-4 h-4 text-primary-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            )}
            <div className="text-left">
              <p className="text-xs font-bold leading-tight">{imageScanning ? 'Scanning…' : 'Scan image'}</p>
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                {imageScanning ? 'AI reading…' : 'Screenshot · AI'}
              </p>
            </div>
          </button>
        </div>
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
                      <p key={j} className="text-xs text-slate-400 pl-2">· {ex.name} — {ex.defaultSets}×{ex.defaultReps}</p>
                    ))}
                  </div>
                ))}
                {parsedPlan.workouts.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No workouts found in file</p>
                )}
              </div>
            </div>
            <Input
              label="Plan Name"
              autoFocus
              value={importName}
              onChange={e => setImportName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !importSaved && confirmImport()}
            />
            <Button fullWidth loading={upsertPlan.isPending} onClick={confirmImport}>
              {importSaved ? '✓ Saved!' : 'Load Plan'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Paste text modal ── */}
      {showTextModal && (
        <Modal title="Paste Your Plan" onClose={() => setShowTextModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Edit the template below, then tap <strong>Import</strong>.</p>
            <textarea
              className="w-full h-56 text-sm font-mono p-3 rounded-xl border border-slate-200 bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            {textError && (
              <p className="text-sm text-red-500">{textError}</p>
            )}
            <Button fullWidth onClick={confirmPastedText}>
              Import
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Format guide modal ── */}
      {showFormatGuide && <FormatGuideModal onClose={() => setShowFormatGuide(false)} />}
    </>
  );
}
