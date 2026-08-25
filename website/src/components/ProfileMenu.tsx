import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

function formatArkId(raw: string | null | undefined) {
  if (!raw) return 'Assigned in the app';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return raw;
}

export function ProfileMenu() {
  const { user, profile, profileOpen, openProfile, closeProfile, refreshProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
  }, [profile]);

  useEffect(() => {
    if (!profileOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeProfile();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeProfile();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen, closeProfile]);

  if (!user) return null;

  const onSaveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const name = displayName.trim();
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: name || null,
      });
      if (error) throw error;
      await refreshProfile();
      setMsg('Display name saved.');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const onResetPassword = async () => {
    if (!supabase || !user.email) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const redirectTo = `${window.location.origin}/account/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
      if (error) throw error;
      setMsg('Password reset email sent. Check your inbox.');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Could not send reset email.');
    } finally {
      setBusy(false);
    }
  };

  const copyArkId = async () => {
    if (!profile?.ark_id) return;
    await navigator.clipboard.writeText(formatArkId(profile.ark_id));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const label = profile?.display_name?.trim() || user.email?.split('@')[0] || 'Profile';

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-primary btn-compact"
        aria-expanded={profileOpen}
        aria-haspopup="dialog"
        onClick={() => (profileOpen ? closeProfile() : openProfile())}
      >
        {label.length > 18 ? `${label.slice(0, 16)}…` : label}
      </button>

      {profileOpen ? (
        <div className="profile-panel" role="dialog" aria-label="Account settings">
          <div className="profile-panel-head">
            <div>
              <p className="text-sm font-medium text-[var(--fg)] truncate max-w-[220px]">{user.email}</p>
              <p className="text-xs text-[var(--fg-muted)] mt-0.5">Account</p>
            </div>
            <button type="button" className="auth-close" onClick={closeProfile} aria-label="Close">
              ×
            </button>
          </div>

          <div className="profile-section">
            <p className="profile-label">Display name</p>
            <form onSubmit={onSaveName} className="flex gap-2">
              <input
                className="field !min-h-9 !py-1.5 !text-sm"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={40}
              />
              <button type="submit" className="btn btn-ghost btn-compact shrink-0" disabled={busy}>
                Save
              </button>
            </form>
          </div>

          <div className="profile-section">
            <p className="profile-label">ARK ID</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--fg)] tracking-wide">
                {formatArkId(profile?.ark_id)}
              </p>
              {profile?.ark_id ? (
                <button type="button" className="text-xs text-[var(--accent)] hover:underline" onClick={() => void copyArkId()}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              ) : null}
            </div>
            {!profile?.ark_id ? (
              <p className="text-xs text-[var(--fg-muted)] mt-1 leading-relaxed">
                Your ARK ID is created when you open the desktop app and finish account setup there.
              </p>
            ) : null}
          </div>

          <div className="profile-section">
            <p className="profile-label">Security</p>
            <ul className="space-y-2 text-sm text-[var(--fg-muted)]">
              <li className="flex items-center justify-between gap-3">
                <span>Password</span>
                <button
                  type="button"
                  className="text-[var(--accent)] hover:underline text-xs"
                  disabled={busy}
                  onClick={() => void onResetPassword()}
                >
                  Reset via email
                </button>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Authenticator 2FA</span>
                <span className="text-xs opacity-70">Coming soon</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Email confirmation</span>
                <span className="text-xs opacity-70">
                  {user.email_confirmed_at ? 'Confirmed' : 'Pending'}
                </span>
              </li>
            </ul>
          </div>

          {err ? <p className="text-xs text-red-500 mt-2">{err}</p> : null}
          {msg ? <p className="text-xs text-[var(--accent)] mt-2">{msg}</p> : null}

          <button
            type="button"
            className="btn btn-ghost w-full mt-4 !min-h-9 !text-sm"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
