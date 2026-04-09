import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlans, useUpsertPlan } from '../hooks/usePlans';
import { useActivePlanId, useSetActivePlanId } from '../hooks/useSettings';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/Modal';
import { Header, HeaderAddButton } from '../components/layout/Header';
import { uid } from '../utils';

export function PlansPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: plans = [],   isLoading } = usePlans();
  const { data: activePlanId }            = useActivePlanId();
  const upsertPlan                        = useUpsertPlan();
  const setActivePlan                     = useSetActivePlanId();
  const [showModal, setShowModal]         = useState(false);
  const [newName,   setNewName]           = useState('');

  // Auto-open create modal when navigated here with openCreate state (e.g. from Dashboard)
  useEffect(() => {
    if ((location.state as { openCreate?: boolean } | null)?.openCreate) {
      setShowModal(true);
      // Clear the state so refreshing doesn't re-open
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

  return (
    <>
      <Header
        title="My Plans"
        action={<HeaderAddButton onClick={() => setShowModal(true)} />}
      />

      <div className="p-4">
        {isLoading ? <Spinner /> : plans.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-bold text-slate-900 mb-1">No plans yet</p>
            <p className="text-sm text-slate-500 mb-5">Tap + to create your first plan</p>
            <Button onClick={() => setShowModal(true)}>Create Plan</Button>
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
    </>
  );
}
