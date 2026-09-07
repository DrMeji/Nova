import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Mail, Lock, AlertCircle, Zap, Eye, EyeOff, User, FolderOpen, RefreshCw, Github } from 'lucide-react';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';
import {
  formatForgotPasswordHelp,
  getLocalLoginRecoveryInfo,
  markLocalRecoveryNoticeShown,
  revealLocalLoginRecovery,
  shouldShowLocalRecoveryNotice,
} from '@/lib/localAuthRecovery';
import { checkArkGitHubUpdate, downloadAndInstallArkUpdate } from '@/lib/arkUpdates';
import { accountForgotPageUrl } from '@/lib/accountWeb';
import { NovaMark } from '@/components/NovaMark';

const TYPE_PHRASES = [
  'NOVA',
  'Free',
  'Local',
  'Build anything',
  'Free models',
  'Create',
  'Private AI',
  'Enjoy',
  'Your studio',
  'Code and ship',
];

type AuthMode = 'signin' | 'signup';

function TypewriterHero() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const full = TYPE_PHRASES[phraseIndex];
    const typingMs = deleting ? 36 : 78;
    const pauseMs = deleting ? 280 : 1400;

    if (!deleting && text === full) {
      const t = window.setTimeout(() => setDeleting(true), pauseMs);
      return () => window.clearTimeout(t);
    }

    if (deleting && text === '') {
      const t = window.setTimeout(() => {
        setDeleting(false);
        setPhraseIndex(i => (i + 1) % TYPE_PHRASES.length);
      }, pauseMs);
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(() => {
      setText(prev =>
        deleting ? full.slice(0, Math.max(0, prev.length - 1)) : full.slice(0, prev.length + 1),
      );
    }, typingMs);

    return () => window.clearTimeout(t);
  }, [text, deleting, phraseIndex]);

  return (
    <div className="hidden lg:flex flex-1 items-center justify-center px-10 xl:px-16 select-none relative z-10">
      <div className="max-w-2xl w-full">
        <p className="text-sm tracking-[0.2em] text-content-tertiary mb-6 uppercase">
          Build and create
        </p>
        <h1 className="text-6xl xl:text-7xl font-semibold tracking-tight leading-[1.12] min-h-[1.2em]">
          <span className="auth-type-rainbow">{text}</span>
          <span className="inline-block w-[3px] h-[0.85em] ml-1.5 align-[-0.08em] bg-content-primary animate-cursor-blink" />
        </h1>
        <p className="mt-8 text-base text-content-secondary max-w-md leading-relaxed">
          Local models, cloud providers, and tools in one place. Built to keep you creating.
        </p>
      </div>
    </div>
  );
}

export function AuthScreen() {
  const { signIn, signUp, bypassLogin, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [showBypass, setShowBypass] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState(() => shouldShowLocalRecoveryNotice());
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateHint, setUpdateHint] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.arkDesktop?.appMeta?.()
      .then(meta => {
        // Guest continue is unpackaged/dev only. never on Setup.exe installs.
        setShowBypass(!meta?.isPackaged);
      })
      .catch(() => setShowBypass(false));
  }, []);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
    if (next === 'signin') setFullName('');
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (trimmed) {
      setLoading(true);
      try {
        const res = await resetPassword(trimmed);
        if (!res.error) {
          setInfo(`If an account exists for ${trimmed}, check your email for a reset link.`);
          return;
        }
        setError(res.error);
      } finally {
        setLoading(false);
      }
    }
    const forgotUrl = accountForgotPageUrl();
    if (forgotUrl && window.arkDesktop?.openExternal) {
      void window.arkDesktop.openExternal(forgotUrl);
      setInfo('Opened the NOVA account site. Use Forgot password there if email reset is not configured in this build.');
      return;
    }
    const info = await getLocalLoginRecoveryInfo();
    setInfo(formatForgotPasswordHelp(info));
    if (info.exists || info.folder) {
      void revealLocalLoginRecovery();
    }
  };

  const handleSignedOutUpdateCheck = async () => {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateHint('Checking for updates…');
    try {
      const info = await checkArkGitHubUpdate();
      if (!info.ok) {
        setUpdateHint(info.message || 'Could not check for updates.');
        return;
      }
      if (!info.newerAvailable || !info.setupAssetUrl) {
        setUpdateHint(info.message || 'You are on the latest published build.');
        return;
      }
      setUpdateHint(`${info.message} Downloading…`);
      const result = await downloadAndInstallArkUpdate({
        setupAssetUrl: info.setupAssetUrl,
        latestTag: info.latestTag,
      });
      if (!result?.ok) {
        setUpdateHint(result?.message || 'Update failed.');
      }
    } catch (err) {
      setUpdateHint(err instanceof Error ? err.message : 'Update check failed');
    } finally {
      setUpdateBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email to continue.');
      return;
    }
    if (mode === 'signup' && fullName.trim().length < 2) {
      setError('Enter your name (first and last is fine in one field).');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === 'signin') {
      const signedIn = await signIn(email.trim(), password);
      setLoading(false);
      if (signedIn.error) setError(signedIn.error);
      return;
    }

    // Users do not pick their own handle/username. We assign a 7-digit NOVA ID automatically.
    // Display name is their real name from this form (not a unique username).
    const created = await signUp(email.trim(), password, fullName.trim());
    if (created.error) {
      setLoading(false);
      setError(created.error);
      return;
    }

    const signedIn = await signIn(email.trim(), password);
    setLoading(false);
    if (signedIn.error) {
      setError('Account created. If email confirmation is required, check your inbox, then sign in.');
      setMode('signin');
    }
  };

  return (
    <div className="h-full min-h-0 bg-ark-navy-950 flex relative overflow-hidden">
      <AuthAmbientOrbs />

      <TypewriterHero />

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] animate-fade-in">
          <div className="lg:hidden text-center mb-8">
            <NovaMark className="w-10 h-10 text-content-primary mx-auto" title="NOVA" />
          </div>

          <div className="rounded-2xl border border-surface-border bg-ark-navy-900/90 p-7 sm:p-8 shadow-2xl animate-slide-up backdrop-blur-sm">
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-surface-border bg-ark-navy-950/80 p-1">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'signin'
                      ? 'bg-surface-hover text-content-primary'
                      : 'text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'signup'
                      ? 'bg-surface-hover text-content-primary'
                      : 'text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  Sign up
                </button>
              </div>
              <p className="text-center text-sm text-content-secondary mt-4">
                {mode === 'signin' ? 'Welcome back to NOVA' : 'Create your NOVA account'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="ark-input pl-10 h-12 rounded-xl"
                  autoComplete="email"
                />
              </div>

              {mode === 'signup' && (
                <div className="relative animate-fade-in">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="ark-input pl-10 h-12 rounded-xl"
                    autoComplete="name"
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div className="text-[11px] text-content-tertiary px-1 animate-fade-in">
                  Your 7-digit NOVA ID is assigned automatically. Profile photo can be added later in Settings.
                </div>
              )}

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password' : 'Your password'}
                  className="ark-input pl-10 pr-12 h-12 rounded-xl"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {mode === 'signin' && (
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={loading}
                    className="text-xs text-content-tertiary hover:text-content-secondary"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {recoveryNotice && (
                <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-[11px] text-sky-100/90 leading-relaxed space-y-2">
                  <p>
                    Temporary: NOVA can also save a private login note on this PC (see folder after forgot-password). Real email reset works when the account website is configured for this build.
                  </p>
                  <button
                    type="button"
                    className="text-sky-300 hover:text-sky-200 underline"
                    onClick={() => {
                      markLocalRecoveryNoticeShown();
                      setRecoveryNotice(false);
                    }}
                  >
                    Got it
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-ark-accent-red bg-ark-accent-red/10 border border-ark-accent-red/20 rounded-xl px-3 py-2.5 animate-fade-in">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {info && (
                <div className="flex items-start gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 animate-fade-in">
                  <span>{info}</span>
                </div>
              )}

              <button type="submit" disabled={loading} className="ark-btn-primary w-full h-11 rounded-xl">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            {showBypass && (
              <>
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-surface-border" />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-content-tertiary">or</span>
                  <div className="flex-1 h-px bg-surface-border" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => bypassLogin({ skipSetup: false })}
                    disabled={loading}
                    className="ark-btn-secondary h-11 rounded-xl px-2"
                    title="Sign in as guest, then run hardware setup"
                  >
                    <Zap className="w-3.5 h-3.5 text-ark-accent-amber shrink-0" />
                    <span className="text-xs leading-tight text-left">Bypass + Setup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => bypassLogin({ skipSetup: true })}
                    disabled={loading}
                    className="ark-btn-secondary h-11 rounded-xl px-2"
                    title="Skip setup and go straight to the main app"
                  >
                    <Zap className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="text-xs leading-tight text-left">Bypass to App</span>
                  </button>
                </div>
              </>
            )}

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Open NOVA on GitHub"
                  aria-label="Open NOVA on GitHub"
                  className="h-11 w-11 shrink-0 rounded-xl border border-white/15 bg-white/[0.04] text-content-secondary hover:text-content-primary hover:bg-white/[0.08] flex items-center justify-center"
                  onClick={() =>
                    void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Nova/releases')
                  }
                >
                  <Github className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  className="ark-btn-ghost flex-1 h-11 rounded-full text-xs"
                  disabled={updateBusy}
                  onClick={() => void handleSignedOutUpdateCheck()}
                >
                  {updateBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Check for update (no sign-in)
                </button>
              </div>
              {updateHint ? (
                <p className="text-center text-[11px] text-content-tertiary leading-relaxed whitespace-pre-wrap">
                  {updateHint}
                </p>
              ) : (
                <p className="text-center text-[11px] text-content-tertiary leading-relaxed">
                  Check for an in-app update without signing in, or open public GitHub releases with the icon.
                </p>
              )}
              <button
                type="button"
                className="ark-btn-ghost w-full h-9 rounded-xl text-xs text-content-tertiary"
                onClick={() => void revealLocalLoginRecovery()}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Open local password note folder
              </button>
            </div>

            <p className="text-center text-[11px] text-content-tertiary mt-3 leading-relaxed">
              By continuing, you agree to our{' '}
              <button
                type="button"
                className="underline hover:text-content-secondary"
                onClick={() => void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Nova/blob/main/README.md')}
              >
                Terms of Service
              </button>
              {' '}and{' '}
              <button
                type="button"
                className="underline hover:text-content-secondary"
                onClick={() => void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Nova/blob/main/README.md')}
              >
                Privacy Policy
              </button>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
