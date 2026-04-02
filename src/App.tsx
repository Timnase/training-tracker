import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Spinner } from './components/ui/Spinner';
import { BottomNav } from './components/layout/BottomNav';
import { supabase } from './lib/supabase';

import { AuthPage }           from './pages/AuthPage';
import { ResetPasswordPage }  from './pages/ResetPasswordPage';
import { DashboardPage }      from './pages/DashboardPage';
import { PlansPage }          from './pages/PlansPage';
import { PlanEditPage }       from './pages/PlanEditPage';
import { WorkoutEditPage }    from './pages/WorkoutEditPage';
import { LogPage }            from './pages/LogPage';
import { LogSessionPage }     from './pages/LogSessionPage';
import { HistoryPage }        from './pages/HistoryPage';
import { SettingsPage }       from './pages/SettingsPage';

// Listens for Supabase PASSWORD_RECOVERY event and redirects to the reset page
function PasswordRecoveryListener() {
  const navigate = useNavigate();
  useEffect(() => {
    // PKCE recovery: Supabase redirects to ?recovery=1&code=XXX
    // Check the param immediately — no event timing race condition
    const params = new URLSearchParams(window.location.search);
    if (params.get('recovery') === '1') {
      navigate('/reset-password', { replace: true });
      return;
    }
    // Fallback for any other recovery flow
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password', { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user)   return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto flex flex-col">
      <div className="flex-1 pb-20">{children}</div>
      <BottomNav />
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner />
      </div>
    );
  }

  return (
    <HashRouter>
      <PasswordRecoveryListener />
      <Routes>
        {/* Public */}
        <Route path="/auth"           element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected */}
        <Route path="/*" element={
          <AuthGuard>
            <AppLayout>
              <Routes>
                <Route index                                        element={<DashboardPage />} />
                <Route path="plans"                                element={<PlansPage />} />
                <Route path="plans/:planId"                        element={<PlanEditPage />} />
                <Route path="plans/:planId/workouts/:workoutId"    element={<WorkoutEditPage />} />
                <Route path="log"                                  element={<LogPage />} />
                <Route path="log/session"                         element={<LogSessionPage />} />
                <Route path="history"                              element={<HistoryPage />} />
                <Route path="settings"                             element={<SettingsPage />} />
                <Route path="*"                                    element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          </AuthGuard>
        } />
      </Routes>
    </HashRouter>
  );
}
