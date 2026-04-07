import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';

export function ResetPasswordPage() {
  const [ready,    setReady]    = useState(false);
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Wait for the recovery session to be available.
  // The PasswordRecoveryListener in App.tsx now exchanges the PKCE code before
  // navigating here, so getSession() should resolve immediately in most cases.
  // The onAuthStateChange listener acts as a fallback for any remaining timing edge cases.
  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; setReady(true); } };

    // Check immediately — code exchange likely already completed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish();
    });

    // Fallback: listen for the auth event in case exchange is still in flight
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    // Last-resort timeout after 15 seconds
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        setError('Link expired or already used. Please request a new reset email.');
        setReady(true);
      }
    }, 15000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const submit = async () => {
    setError('');
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)  { setError('Passwords do not match.');                return; }
    setLoading(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) { setError(e.message); setLoading(false); return; }
    // Full reload to clear ?recovery=1 from URL and start fresh as logged-in user
    window.location.replace(window.location.pathname + '#/');
  };

  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔑</div>
          <h1 className="text-2xl font-extrabold text-slate-900">New Password</h1>
          <p className="text-sm text-slate-500 mt-1">Choose a strong password</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          {!ready ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <>
              {error && <p className="bg-red-50 text-red-500 text-sm px-3 py-2 rounded-lg">{error}</p>}
              <Input
                label="New Password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
              <Button fullWidth loading={loading} onClick={submit}>
                Set New Password
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
