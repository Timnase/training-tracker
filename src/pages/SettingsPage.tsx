import { useRef } from 'react';
import { usePlans } from '../hooks/usePlans';
import { useWorkouts } from '../hooks/useWorkouts';
import { useActivePlanId, useSetActivePlanId } from '../hooks/useSettings';
import { useAuth } from '../hooks/useAuth';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { supabase } from '../lib/supabase';
import type { WorkoutLog, Plan } from '../types';

// ─── Export ───────────────────────────────────────────────────────────────────

function exportData(plans: Plan[], workouts: WorkoutLog[]) {
  const blob = new Blob([JSON.stringify({ plans, workouts }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `training-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user }                            = useAuth();
  const { data: plans    = [], isLoading: plansLoading }    = usePlans();
  const { data: workouts = [], isLoading: workoutsLoading } = useWorkouts();
  const { data: activePlanId }              = useActivePlanId();
  const setActivePlan                       = useSetActivePlanId();
  const fileRef                             = useRef<HTMLInputElement>(null);

  const isLoading = plansLoading || workoutsLoading;

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target?.result as string) as { plans?: Plan[]; workouts?: WorkoutLog[] };
        if (!data.plans && !data.workouts) { alert('Invalid backup file.'); return; }
        if (!confirm(`Import ${data.plans?.length ?? 0} plans and ${data.workouts?.length ?? 0} workouts? This adds to existing data.`)) return;

        for (const plan of data.plans ?? []) {
          await supabase.from('plans').upsert({ id: plan.id, name: plan.name, workouts: plan.workouts });
        }
        for (const w of data.workouts ?? []) {
          await supabase.from('workouts').upsert({
            id: w.id, plan_id: w.planId, plan_name: w.planName,
            workout_template_id: w.workoutTemplateId, workout_template_name: w.workoutTemplateName,
            date: w.date, feeling: w.feeling, cardio: w.cardio, notes: w.notes, exercises: w.exercises,
          });
        }
        alert('Import complete! Refresh to see changes.');
      } catch {
        alert('Failed to parse file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Replace entire history so back button can't return to a logged-in page
    window.location.replace(window.location.pathname + '#/auth');
  };

  return (
    <>
      <Header title="Settings" />
      <div className="p-4 space-y-5 pb-8">

        {/* Account */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Account</p>
          <p className="text-sm text-slate-700 font-semibold">{user?.email}</p>
          <Button variant="outline" size="sm" onClick={handleLogout}>Sign Out</Button>
        </section>

        {/* Active plan */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Active Plan</p>
          {isLoading ? <Spinner /> : (
            <div className="space-y-2">
              {plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => setActivePlan.mutate(plan.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold
                    ${plan.id === activePlanId
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-600'
                    }`}
                >
                  {plan.name}
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    {plan.workouts.length} workout{plan.workouts.length !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
              {plans.length === 0 && <p className="text-sm text-slate-400">No plans yet</p>}
            </div>
          )}
        </section>

        {/* Backup */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Data Backup</p>
          <Button
            variant="outline"
            fullWidth
            onClick={() => exportData(plans, workouts)}
            disabled={isLoading}
          >
            Export JSON Backup
          </Button>
          <Button variant="outline" fullWidth onClick={() => fileRef.current?.click()}>
            Import JSON Backup
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <p className="text-xs text-slate-400">Import adds to existing data without overwriting.</p>
        </section>

      </div>
    </>
  );
}
