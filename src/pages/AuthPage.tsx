import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ProfileService } from '../services/profile.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

type Mode = 'login' | 'signup' | 'forgot';

export function AuthPage() {
  const [mode,        setMode]        = useState<Mode>('login');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [loading,     setLoading]     = useState(false);

  const reset = (next: Mode) => { setMode(next); setError(''); setSuccess(''); };

  const submit = async () => {
    setError(''); setSuccess('');
    setLoading(true);

    if (mode === 'forgot') {
      // redirectTo is unused — the email template links directly with token_hash.
      // Kept here as a fallback in case template is not yet updated.
      const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://timnase.github.io/training-tracker/?recovery=1',
      });
      if (e) setError(e.message);
      else   setSuccess('Check your email for a reset link!');
      setLoading(false);
      return;
    }

    if (mode === 'signup') {
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) { setError(authError.message); setLoading(false); return; }
      // Save display name right after sign-up if provided
      if (displayName.trim()) {
        try { await ProfileService.upsertProfile(displayName); } catch { /* non-critical */ }
      }
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
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
            {mode === 'login'  ? 'Welcome back'       :
             mode === 'signup' ? 'Create your account' :
                                 'Reset password'}
          </h2>

          {error   && <p className="bg-red-50   text-red-500   text-sm px-3 py-2 rounded-lg">{error}</p>}
          {success && <p className="bg-green-50 text-green-600 text-sm px-3 py-2 rounded-lg">{success}</p>}

          <Input
            label="Email"
            type="email"
            placeholder="your@email.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          {mode !== 'forgot' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className="w-full px-3.5 py-2.5 pr-11 border border-slate-200 rounded-xl text-[15px] text-slate-900 bg-white focus:outline-none focus:border-primary-500 transition-colors placeholder:text-slate-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>
          )}

          {mode === 'signup' && (
            <Input
              label="Display Name (optional)"
              placeholder="Your name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          )}

          {mode === 'login' && (
            <button
              onClick={() => reset('forgot')}
              className="text-xs text-slate-400 hover:text-primary-500 font-medium -mt-2 text-right w-full"
            >
              Forgot password?
            </button>
          )}

          <Button fullWidth loading={loading} onClick={submit}>
            {mode === 'login'  ? 'Log In'           :
             mode === 'signup' ? 'Sign Up'           :
                                 'Send Reset Email'}
          </Button>

          {mode === 'forgot' ? (
            <button onClick={() => reset('login')} className="w-full text-center text-sm text-primary-500 font-semibold">
              Back to login
            </button>
          ) : (
            <button
              onClick={() => reset(mode === 'login' ? 'signup' : 'login')}
              className="w-full text-center text-sm text-primary-500 font-semibold"
            >
              {mode === 'login' ? "No account yet? Sign up" : "Already have an account? Log in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
