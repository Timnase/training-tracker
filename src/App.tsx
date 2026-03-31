import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Spinner } from './components/ui/Spinner';
import { BottomNav } from './components/layout/BottomNav';

import { AuthPage }        from './pages/AuthPage';
import { DashboardPage }   from './pages/DashboardPage';
import { PlansPage }       from './pages/PlansPage';
import { PlanEditPage }    from './pages/PlanEditPage';
import { WorkoutEditPage } from './pages/WorkoutEditPage';
import { LogPage }         from './pages/LogPage';
import { LogSessionPage }  from './pages/LogSessionPage';
import { HistoryPage }     from './pages/HistoryPage';
import { SettingsPage }    from './pages/SettingsPage';

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
      <Routes>
        {/* Public */}
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />

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
