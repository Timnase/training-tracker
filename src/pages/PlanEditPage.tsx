import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlan, useUpsertPlan, useDeletePlan } from '../hooks/usePlans';
import { useSetActivePlanId, useActivePlanId } from '../hooks/useSettings';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/Modal';
import { Header, HeaderAddButton } from '../components/layout/Header';
import { uid } from '../utils';
import type { Plan } from '../types';

export function PlanEditPage() {
  const { planId }   = useParams<{ planId: string }>();
  const navigate     = useNavigate();
  const plan         = usePlan(planId!);
  const upsertPlan   = useUpsertPlan();
  const deletePlan   = useDeletePlan();
  const setActive    = useSetActivePlanId();
  const { data: activePlanId } = useActivePlanId();

  const [editName,   setEditName]   = useState('');
  const [showModal,  setShowModal]  = useState(false);
  const [newWtName,  setNewWtName]  = useState('');

  if (!plan) return <Spinner />;

  const saveName = async () => {
    if (!editName.trim() || editName.trim() === plan.name) return;
    await upsertPlan.mutateAsync({ ...plan, name: editName.trim() });
  };

  const addWorkout = async () => {
    if (!newWtName.trim()) return;
    const updated: Plan = {
      ...plan,
      workouts: [...plan.workouts, { id: uid(), name: newWtName.trim(), exercises: [] }],
    };
    await upsertPlan.mutateAsync(updated);
    setShowModal(false);
    setNewWtName('');
  };

  const removeWorkout = async (workoutId: string) => {
    if (!confirm('Delete this workout from the plan?')) return;
    const updated: Plan = { ...plan, workouts: plan.workouts.filter(w => w.id !== workoutId) };
    await upsertPlan.mutateAsync(updated);
  };

  const handleDeletePlan = async () => {
    if (!confirm('Delete this entire plan?')) return;
    await deletePlan.mutateAsync(plan.id);
    if (activePlanId === plan.id) await setActive.mutateAsync(null);
    navigate('/plans');
  };

  return (
    <>
      <Header
        title={plan.name}
        showBack
        backTo="/plans"
        action={<HeaderAddButton onClick={() => setShowModal(true)} />}
      />

      <div className="p-4 space-y-4">
        {/* Rename */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Plan Name</p>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              defaultValue={plan.name}
              onChange={e => setEditName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => e.key === 'Enter' && saveName()}
            />
          </div>
        </div>

        {/* Workouts list */}
        {plan.workouts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-3xl mb-2">🏋️</p>
            <p className="font-bold text-slate-900 mb-1">No workouts yet</p>
            <p className="text-sm text-slate-500 mb-4">Add Workout A, Workout B, etc.</p>
            <Button variant="outline" onClick={() => setShowModal(true)}>Add Workout</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 px-1">Workouts</p>
            {plan.workouts.map(wt => (
              <div
                key={wt.id}
                className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 cursor-pointer"
                onClick={() => navigate(`/plans/${plan.id}/workouts/${wt.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{wt.name}</p>
                  <p className="text-sm text-slate-400">
                    {wt.exercises.length} exercise{wt.exercises.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeWorkout(wt.id); }}
                  className="text-slate-300 hover:text-red-400 p-1"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                </button>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-slate-300"><polyline points="9 18 15 12 9 6" /></svg>
              </div>
            ))}
            <Button variant="outline" fullWidth onClick={() => setShowModal(true)}>
              + Add Workout
            </Button>
          </div>
        )}

        <Button variant="danger" size="sm" fullWidth onClick={handleDeletePlan}>
          Delete Plan
        </Button>
      </div>

      {showModal && (
        <Modal title="Add Workout" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <Input
              label="Workout Name"
              placeholder="e.g. Workout A – Lower Body"
              autoFocus
              value={newWtName}
              onChange={e => setNewWtName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addWorkout()}
            />
            <Button fullWidth loading={upsertPlan.isPending} onClick={addWorkout}>
              Add Workout
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
