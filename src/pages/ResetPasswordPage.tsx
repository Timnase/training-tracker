import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function ResetPasswordPage() {
  const navigate             = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const submit = async () => {
    setError('');
    if (password.length < 6)        { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)        { setError('Passwords do not match.');                return; }
    setLoading(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) { setError(e.message); setLoading(false); return; }
    navigate('/', { replace: true });
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
        </div>
      </div>
    </div>
  );
}
