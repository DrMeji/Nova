import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Mail, Lock, AlertCircle, Eye, EyeOff, User, Zap } from 'lucide-react';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';
import {
  formatForgotPasswordHelp,
  getLocalLoginRecoveryInfo,
  revealLocalLoginRecovery,
} from '@/lib/localAuthRecovery';
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
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.arkDesktop?.appMeta?.()
      .then(meta => {
        // Dev / Open-NOVA-Build.bat only — never on packaged Setup.exe installs.
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
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter your account email first, then tap Forgot password.');
      return;
    }
    setLoading(true);
    try {
      const res = await resetPassword(trimmed);
      if (!res.error) {
        setInfo(`If an account exists for ${trimmed}, check your email for a reset link.`);
        return;
      }
      // Configured email path failed — show that error only (do not stack local recovery unless unconfigured).
      const unconfigured = /VITE_ARK_WEBSITE_ORIGIN|not configured/i.test(res.error);
      setError(res.error);
      if (!unconfigured) return;
      const forgotUrl = accountForgotPageUrl();
      if (forgotUrl && window.arkDesktop?.openExternal) {
        void window.arkDesktop.openExternal(forgotUrl);
        setInfo('Opened the NOVA account site so you can reset there.');
        return;
      }
      const recovery = await getLocalLoginRecoveryInfo();
      setInfo(formatForgotPasswordHelp(recovery));
      if (recovery.exists || recovery.folder) {
        void revealLocalLoginRecovery();
      }
    } finally {
      setLoading(false);
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

          <div className="rounded-2xl border border-surface-border bg-ark-navy-900 p-7 sm:p-8 shadow-2xl animate-slide-up">
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-surface-border bg-ark-navy-950 p-1">
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
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col">
              <div
                className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
                  mode === 'signup'
                    ? 'grid-rows-[1fr] opacity-100 mb-3'
                    : 'grid-rows-[0fr] opacity-0 mb-0'
                }`}
                aria-hidden={mode !== 'signup'}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className={`relative ${mode === 'signup' ? '' : 'pointer-events-none'}`}>
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                    <input
                      type="text"
                      required={mode === 'signup'}
                      tabIndex={mode === 'signup' ? 0 : -1}
                      minLength={2}
                      maxLength={80}
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Your name"
                      className="ark-input pl-10 h-12 rounded-xl"
                      autoComplete="name"
                      disabled={mode !== 'signup'}
                    />
                  </div>
                </div>
              </div>

              <div className="relative mb-3">
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

              <div className="relative mb-3">
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

              <div
                className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
                  mode === 'signin'
                    ? 'grid-rows-[1fr] opacity-100 mb-3'
                    : 'grid-rows-[0fr] opacity-0 mb-0'
                }`}
                aria-hidden={mode !== 'signin'}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={loading || mode !== 'signin'}
                      tabIndex={mode === 'signin' ? 0 : -1}
                      className="text-xs text-content-tertiary hover:text-content-secondary"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-ark-accent-red bg-ark-accent-red/10 border border-ark-accent-red/20 rounded-xl px-3 py-2.5 mb-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {info && (
                <div className="flex items-start gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 mb-3">
                  <span>{info}</span>
                </div>
              )}

              <button type="submit" disabled={loading} className="ark-btn-primary w-full h-11 rounded-xl">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="text-center text-[11px] text-content-tertiary mt-4 leading-relaxed">
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

          {/* Temporary: Open-NOVA-Build.bat / unpackaged only — remove before retail. */}
          {showBypass && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => bypassLogin({ skipSetup: false })}
                disabled={loading}
                className="ark-btn-secondary h-11 rounded-xl px-2"
                title="Dev only: sign in as guest, then run hardware setup"
              >
                <Zap className="w-3.5 h-3.5 text-ark-accent-amber shrink-0" />
                <span className="text-xs leading-tight text-left">Bypass + Setup</span>
              </button>
              <button
                type="button"
                onClick={() => bypassLogin({ skipSetup: true })}
                disabled={loading}
                className="ark-btn-secondary h-11 rounded-xl px-2"
                title="Dev only: skip setup and go straight to the main app"
              >
                <Zap className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-xs leading-tight text-left">Bypass to App</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
