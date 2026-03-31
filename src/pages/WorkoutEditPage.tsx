import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePlan, useUpsertPlan } from '../hooks/usePlans';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/Modal';
import { Header, HeaderAddButton } from '../components/layout/Header';
import { groupExercises, uid } from '../utils';
import type { Exercise, Plan } from '../types';

interface ExerciseFormState {
  name:         string;
  defaultSets:  string;
  defaultReps:  string;
  supersetWith: string;
}

const DEFAULT_FORM: ExerciseFormState = { name: '', defaultSets: '3', defaultReps: '8-12', supersetWith: '' };

export function WorkoutEditPage() {
  const { planId, workoutId } = useParams<{ planId: string; workoutId: string }>();
const plan                  = usePlan(planId!);
  const upsertPlan            = useUpsertPlan();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<ExerciseFormState>(DEFAULT_FORM);

  if (!plan) return <Spinner />;
  const wt = plan.workouts.find(w => w.id === workoutId);
  if (!wt) return <Spinner />;

  const exercises = wt.exercises;
  const groups    = groupExercises(exercises);

  const updatePlan = (newExercises: Exercise[]) => {
    const updated: Plan = {
      ...plan,
      workouts: plan.workouts.map(w => w.id === workoutId ? { ...w, exercises: newExercises } : w),
    };
    upsertPlan.mutate(updated);
  };

  const openAdd = () => { setEditingId(null); setForm(DEFAULT_FORM); setShowModal(true); };

  const openEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setForm({ name: ex.name, defaultSets: String(ex.defaultSets), defaultReps: ex.defaultReps, supersetWith: '' });
    setShowModal(true);
  };

  const saveExercise = () => {
    if (!form.name.trim()) return;
    const base = { name: form.name.trim(), defaultSets: parseInt(form.defaultSets) || 3, defaultReps: form.defaultReps || '8-12' };

    if (editingId) {
      updatePlan(exercises.map(ex => ex.id === editingId ? { ...ex, ...base } : ex));
    } else {
      let supersetGroupId: string | null = null;
      if (form.supersetWith) {
        const partner = exercises.find(e => e.id === form.supersetWith)!;
        supersetGroupId = partner.supersetGroupId ?? uid();
        const withUpdated = exercises.map(e => e.id === partner.id ? { ...e, supersetGroupId } : e);
        updatePlan([...withUpdated, { id: uid(), ...base, supersetGroupId }]);
        setShowModal(false); setForm(DEFAULT_FORM);
        return;
      }
      updatePlan([...exercises, { id: uid(), ...base, supersetGroupId }]);
    }
    setShowModal(false); setForm(DEFAULT_FORM);
  };

  const deleteExercise = (exId: string) => {
    if (!confirm('Delete this exercise?')) return;
    const target = exercises.find(e => e.id === exId);
    let updated = exercises.filter(e => e.id !== exId);
    if (target?.supersetGroupId) {
      const remaining = updated.filter(e => e.supersetGroupId === target.supersetGroupId);
      if (remaining.length === 1) updated = updated.map(e => e.id === remaining[0].id ? { ...e, supersetGroupId: null } : e);
    }
    updatePlan(updated);
    setShowModal(false);
  };

  const standaloneExercises = exercises.filter(e => !e.supersetGroupId);

  return (
    <>
      <Header
        title={wt.name}
        showBack
        backTo={`/plans/${planId}`}
        action={<HeaderAddButton onClick={openAdd} />}
      />

      <div className="p-4 space-y-3">
        {groups.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-3xl mb-2">🏋️</p>
            <p className="font-bold text-slate-900 mb-1">No exercises yet</p>
            <Button variant="outline" onClick={openAdd}>Add Exercise</Button>
          </div>
        ) : (
          <>
            {groups.map((group, i) =>
              group.type === 'superset' ? (
                <div key={i} className="border-2 border-primary-500 rounded-2xl overflow-hidden">
                  <div className="bg-primary-50 px-4 py-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary-500">⚡ Superset</span>
                  </div>
                  {group.exercises.map(ex => (
                    <ExerciseRow key={ex.id} exercise={ex} onEdit={openEdit} onDelete={deleteExercise} />
                  ))}
                </div>
              ) : (
                <div key={i} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
                  <ExerciseRow exercise={group.exercises[0]} onEdit={openEdit} onDelete={deleteExercise} />
                </div>
              )
            )}
            <Button variant="outline" fullWidth onClick={openAdd}>+ Add Exercise</Button>
          </>
        )}
      </div>

      {showModal && (
        <Modal
          title={editingId ? 'Edit Exercise' : 'Add Exercise'}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4">
            <Input label="Exercise Name" placeholder="e.g. Hip Thrust" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Default Sets" type="number" min="1" value={form.defaultSets} onChange={e => setForm(f => ({ ...f, defaultSets: e.target.value }))} />
              <Input label="Default Reps" placeholder="8-12" value={form.defaultReps} onChange={e => setForm(f => ({ ...f, defaultReps: e.target.value }))} />
            </div>
            {!editingId && standaloneExercises.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500">Superset with (optional)</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-[15px] bg-white focus:outline-none focus:border-primary-500"
                  value={form.supersetWith}
                  onChange={e => setForm(f => ({ ...f, supersetWith: e.target.value }))}
                >
                  <option value="">None – standalone</option>
                  {standaloneExercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
            <Button fullWidth onClick={saveExercise}>
              {editingId ? 'Save Changes' : 'Add Exercise'}
            </Button>
            {editingId && (
              <Button fullWidth variant="danger" size="sm" onClick={() => deleteExercise(editingId)}>
                Delete Exercise
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function ExerciseRow({ exercise, onEdit, onDelete }: {
  exercise: Exercise;
  onEdit:   (ex: Exercise) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-900">{exercise.name}</p>
        <p className="text-xs text-slate-400">{exercise.defaultSets} sets · {exercise.defaultReps} reps</p>
      </div>
      <button onClick={() => onEdit(exercise)} className="text-slate-300 hover:text-slate-500 p-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      </button>
      <button onClick={() => onDelete(exercise.id)} className="text-slate-300 hover:text-red-400 p-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
      </button>
    </div>
  );
}
