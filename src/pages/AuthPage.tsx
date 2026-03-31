import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type Mode = 'login' | 'signup';

export function AuthPage() {
  const [mode,     setMode]     = useState<Mode>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    const fn = mode === 'login'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });
    const { error: authError } = await fn;
    if (authError) setError(authError.message);
    setLoading(false);
  };

  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💪</div>
          <h1 className="text-2xl font-extrabold text-slate-900">Training Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Your personal workout companion</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-[17px] font-bold text-slate-900">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>

          {error && (
            <p className="bg-red-50 text-red-500 text-sm px-3 py-2 rounded-lg">{error}</p>
          )}

          <Input
            label="Email"
            type="email"
            placeholder="your@email.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />

          <Button fullWidth loading={loading} onClick={submit}>
            {mode === 'login' ? 'Log In' : 'Sign Up'}
          </Button>

          <button
            onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); }}
            className="w-full text-center text-sm text-primary-500 font-semibold"
          >
            {mode === 'login' ? "No account yet? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}
