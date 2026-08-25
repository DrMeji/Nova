import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { SiteBackdrop } from '../components/SiteBackdrop';
import { supabase, supabaseConfigured } from '../lib/supabase';

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setErr('Enter the email on your ARK account.');
      return;
    }
    if (!supabaseConfigured || !supabase) {
      setErr(
        'Password reset email is not configured on this preview yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to website/.env.local, then allow this site URL in Supabase Auth redirect URLs.',
      );
      return;
    }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/account/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
      if (error) throw error;
      setMsg('If that email has an ARK account, a reset link is on the way. Check your inbox (and spam).');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Could not send reset email.');
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
            <Link to="/" className="hover:text-[var(--fg)]">
              Home
            </Link>
            <span className="mx-2 opacity-50">/</span>
            Forgot password
          </p>
          <h1 className="display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--fg)] mb-3">
            Reset password
          </h1>
          <p className="text-[var(--fg-muted)] leading-relaxed mb-8">
            We’ll email a link to set a new password. After it works, sign in again inside the ARK desktop app.
          </p>

          <form className="panel space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-1.5">
              <span className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">Email</span>
              <input
                type="email"
                autoComplete="email"
                className="field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            {err ? <p className="text-sm text-rose-500 leading-relaxed">{err}</p> : null}
            {msg ? <p className="text-sm text-emerald-600 dark:text-emerald-400 leading-relaxed">{msg}</p> : null}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            {!supabaseConfigured ? (
              <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
                Preview mode: Supabase keys are optional. Copy website/.env.example to .env.local to enable live reset emails.
              </p>
            ) : null}
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
