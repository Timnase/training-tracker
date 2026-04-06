import { useRef, useState } from 'react';
import { usePlans } from '../hooks/usePlans';
import { useWorkouts } from '../hooks/useWorkouts';
import { useActivePlanId, useSetActivePlanId } from '../hooks/useSettings';
import { useProfile, useSetProfile } from '../hooks/useProfile';
import { useAuth } from '../hooks/useAuth';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
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
  const { user }                                                     = useAuth();
  const { data: plans    = [], isLoading: plansLoading }             = usePlans();
  const { data: workouts = [], isLoading: workoutsLoading }          = useWorkouts();
  const { data: activePlanId }                                       = useActivePlanId();
  const { data: profile,       isLoading: profileLoading }           = useProfile();
  const setActivePlan                                                = useSetActivePlanId();
  const setProfile                                                   = useSetProfile();
  const fileRef                                                      = useRef<HTMLInputElement>(null);

  const [displayName,    setDisplayName]    = useState('');
  const [nameSaved,      setNameSaved]      = useState(false);
  const [nameInitialised, setNameInitialised] = useState(false);

  // Pre-fill once profile loads
  if (!profileLoading && !nameInitialised) {
    setDisplayName(profile?.display_name ?? '');
    setNameInitialised(true);
  }

  const saveProfile = async () => {
    await setProfile.mutateAsync(displayName);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

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
          await supabase.from('plans').upsert({
            id: plan.id, user_id: user!.id, name: plan.name, workouts: plan.workouts,
          }, { onConflict: 'id' });
        }
        for (const w of data.workouts ?? []) {
          await supabase.from('workouts').upsert({
            id: w.id, user_id: user!.id, plan_id: w.planId, plan_name: w.planName,
            workout_template_id: w.workoutTemplateId, workout_template_name: w.workoutTemplateName,
            date: w.date, feeling: w.feeling, cardio: w.cardio, notes: w.notes, exercises: w.exercises,
          }, { onConflict: 'id' });
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
    window.location.replace(window.location.pathname + '#/auth');
  };

  return (
    <>
      <Header title="Settings" />
      <div className="p-4 space-y-5 pb-8">

        {/* Profile */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Profile</p>
          {profileLoading ? <Spinner /> : (
            <>
              <Input
                label="Display Name"
                placeholder="Your name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  loading={setProfile.isPending}
                  onClick={saveProfile}
                >
                  Save
                </Button>
                {nameSaved && <span className="text-xs text-green-500 font-semibold">✓ Saved</span>}
              </div>
            </>
          )}
        </section>

        {/* Account */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Account</p>
          <p className="text-sm font-bold text-slate-900">
            {profile?.display_name || user?.email}
          </p>
          <p className="text-xs text-slate-400">{user?.email}</p>
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
