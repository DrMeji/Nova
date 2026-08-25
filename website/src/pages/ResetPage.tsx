import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { SiteBackdrop } from '../components/SiteBackdrop';
import { supabase, supabaseConfigured } from '../lib/supabase';

export function ResetPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setErr('Password reset is not configured on this preview (missing Supabase env).');
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setReady(true);
        return;
      }
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (!supabaseConfigured || !supabase) {
      setErr('Supabase is not configured for this site preview.');
      return;
    }
    if (password.length < 8) {
      setErr('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg('Password updated. Open the ARK app and sign in with your new password.');
      setPassword('');
      setConfirm('');
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : 'Could not update password. Open the reset link from your email on this page, then try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="site">
      <SiteBackdrop />
      <SiteHeader />
      <main className="site-main px-5 sm:px-8 py-12 sm:py-16">
        <div className="mx-auto max-w-md">
          <p className="text-sm text-[var(--fg-muted)] mb-3">
            <Link to="/account" className="hover:text-[var(--fg)]">
              Account
            </Link>
            <span className="mx-2 opacity-50">/</span>
            New password
          </p>
          <h1 className="display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--fg)] mb-3">
            Choose a new password
          </h1>
          <p className="text-[var(--fg-muted)] leading-relaxed mb-8">
            Open this page from the link in your email. Then set a password and return to the desktop app to sign in.
          </p>

          <form className="panel space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-1.5">
              <span className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                className="field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={!ready}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">Confirm</span>
              <input
                type="password"
                autoComplete="new-password"
                className="field"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                disabled={!ready}
                required
              />
            </label>
            {err ? <p className="text-sm text-rose-500 leading-relaxed">{err}</p> : null}
            {msg ? <p className="text-sm text-emerald-600 leading-relaxed">{msg}</p> : null}
            <button type="submit" className="btn btn-primary w-full" disabled={busy || !ready}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
            <Link to="/account/forgot" className="block text-center text-sm text-[var(--accent)] hover:underline">
              Request another reset link
            </Link>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
