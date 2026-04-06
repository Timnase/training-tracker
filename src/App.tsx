import { lazy, Suspense, useEffect, Component } from 'react';
import type { ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Spinner } from './components/ui/Spinner';
import { SplashScreen } from './components/SplashScreen';
import { BottomNav } from './components/layout/BottomNav';
import { supabase } from './lib/supabase';

// ─── Error boundary ───────────────────────────────────────────────────────────
// Catches render errors and lazy-chunk load failures so the app never goes blank.
class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center', background: '#f8fafc' }}>
        <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>😔</p>
        <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>Something went wrong</p>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: '0.75rem', padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', borderRadius: '0.75rem', border: 'none', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    );
  }
}

// Lazy-load every page so the initial bundle is tiny and the
// splash screen shows immediately while chunks download.
const AuthPage           = lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
const ResetPasswordPage  = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const DashboardPage      = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const PlansPage          = lazy(() => import('./pages/PlansPage').then(m => ({ default: m.PlansPage })));
const PlanEditPage       = lazy(() => import('./pages/PlanEditPage').then(m => ({ default: m.PlanEditPage })));
const WorkoutEditPage    = lazy(() => import('./pages/WorkoutEditPage').then(m => ({ default: m.WorkoutEditPage })));
const LogPage            = lazy(() => import('./pages/LogPage').then(m => ({ default: m.LogPage })));
const LogSessionPage     = lazy(() => import('./pages/LogSessionPage').then(m => ({ default: m.LogSessionPage })));
const HistoryPage        = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const SettingsPage       = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

function PasswordRecoveryListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('recovery') === '1') {
      navigate('/reset-password', { replace: true });
      return;
    }
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

  if (loading) return <SplashScreen />;

  return (
    <HashRouter>
      <ErrorBoundary>
      <PasswordRecoveryListener />
      <Suspense fallback={<SplashScreen />}>
        <Routes>
          <Route path="/auth"           element={user ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/*" element={
            <AuthGuard>
              <AppLayout>
                <Suspense fallback={<Spinner />}>
                  <Routes>
                    <Route index                                     element={<DashboardPage />} />
                    <Route path="plans"                              element={<PlansPage />} />
                    <Route path="plans/:planId"                      element={<PlanEditPage />} />
                    <Route path="plans/:planId/workouts/:workoutId"  element={<WorkoutEditPage />} />
                    <Route path="log"                                element={<LogPage />} />
                    <Route path="log/session"                        element={<LogSessionPage />} />
                    <Route path="history"                            element={<HistoryPage />} />
                    <Route path="settings"                           element={<SettingsPage />} />
                    <Route path="*"                                  element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </AppLayout>
            </AuthGuard>
          } />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </HashRouter>
  );
}
