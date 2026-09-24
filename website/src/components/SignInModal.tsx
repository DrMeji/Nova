import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { NovaMark } from './NovaMark';

export function SignInModal() {
  const { signInOpen, closeSignIn, openProfile, configured } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!signInOpen) return null;

  const onClose = () => {
    setErr(null);
    setInfo(null);
    setPassword('');
    closeSignIn();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    if (!supabase || !configured) {
      setErr('Sign in is not configured yet. You can still download NOVA and create an account in the desktop app.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onClose();
        openProfile();
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) {
          onClose();
          openProfile();
        } else {
          setInfo('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" className="auth-scrim" aria-label="Close" onClick={onClose} />
      <div className="auth-panel">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5 text-[var(--fg)]">
            <NovaMark size={28} />
            <h2 id="auth-title" className="display text-xl font-semibold tracking-tight">
              Sign in
            </h2>
          </div>
          <button type="button" className="auth-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="text-sm text-[var(--fg-muted)] mb-5 leading-relaxed">
          {mode === 'signin'
            ? 'Welcome back. Sign in to manage your account.'
            : 'Create an account with email and password.'}
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              className="field"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <input
              className="field"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {err ? <p className="text-sm text-red-500">{err}</p> : null}
          {info ? <p className="text-sm text-[var(--accent)]">{info}</p> : null}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-sm text-[var(--fg-muted)] text-center">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button
                type="button"
                className="text-[var(--accent)] hover:underline"
                onClick={() => {
                  setMode('signup');
                  setErr(null);
                  setInfo(null);
                }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="text-[var(--accent)] hover:underline"
                onClick={() => {
                  setMode('signin');
                  setErr(null);
                  setInfo(null);
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
