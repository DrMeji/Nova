import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Mail, Lock, AlertCircle, Zap, Eye, EyeOff, User } from 'lucide-react';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';

const TYPE_PHRASES = [
  'ARK',
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
  const { signIn, signUp, resetPassword, bypassLogin } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [showBypass, setShowBypass] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.arkDesktop?.appMeta?.()
      .then(meta => {
        if (meta?.isPackaged) setShowBypass(false);
      })
      .catch(() => {});
  }, []);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Enter your email above, then click Forgot password.');
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    const result = await resetPassword(email.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setInfo('Password reset email sent. Check your inbox for the link.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email to continue.');
      return;
    }
    if (mode === 'signup') {
      const name = username.trim();
      if (name.length < 2) {
        setError('Pick a username (at least 2 characters).');
        return;
      }
      if (!/^[a-zA-Z0-9_\-. ]{2,32}$/.test(name)) {
        setError('Username can use letters, numbers, spaces, _ . - (2–32 chars).');
        return;
      }
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

    const created = await signUp(email.trim(), password, username.trim());
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
            <img
              src={`${import.meta.env.BASE_URL}ark-icon.png`}
              alt="ARK"
              className="w-10 h-10 rounded-xl object-cover mx-auto"
            />
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
                {mode === 'signin' ? 'Welcome back to ARK' : 'Create your ARK account'}
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
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="ark-input pl-10 h-12 rounded-xl"
                    autoComplete="username"
                    maxLength={32}
                  />
                  <p className="mt-1.5 text-[11px] text-content-tertiary px-1">
                    2–32 characters. Letters, numbers, spaces, _ . -
                  </p>
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

            <p className="text-center text-[11px] text-content-tertiary mt-5 leading-relaxed">
              By continuing, you agree to our{' '}
              <button
                type="button"
                className="underline hover:text-content-secondary"
                onClick={() => void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Ark/blob/main/README.md')}
              >
                Terms of Service
              </button>
              {' '}and{' '}
              <button
                type="button"
                className="underline hover:text-content-secondary"
                onClick={() => void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Ark/blob/main/README.md')}
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
