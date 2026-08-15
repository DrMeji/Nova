import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Mail, Lock, AlertCircle, ArrowRight, Zap, Eye, EyeOff } from 'lucide-react';
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

function SocialIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="w-11 h-11 rounded-xl border border-surface-border bg-ark-navy-900/80 flex items-center justify-center hover:bg-surface-hover transition-colors"
    >
      {children}
    </button>
  );
}

export function AuthScreen() {
  const { signIn, signUp, bypassLogin } = useAuth();
  // Bypass is for local testing only — hidden in packaged release builds.
  const [showBypass, setShowBypass] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordStep, setShowPasswordStep] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const lastAuth = (() => {
    try {
      const raw = localStorage.getItem('ark:last-auth');
      if (!raw) return null;
      return JSON.parse(raw) as { method?: string; email?: string; at?: string };
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    void window.arkDesktop?.appMeta?.()
      .then(meta => {
        if (meta?.isPackaged) setShowBypass(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showPasswordStep) passwordRef.current?.focus();
  }, [showPasswordStep]);

  const advanceFromEmail = () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email to continue.');
      return;
    }
    setError(null);
    setShowPasswordStep(true);
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      advanceFromEmail();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPasswordStep) {
      advanceFromEmail();
      return;
    }
    setError(null);
    setLoading(true);

    // One email flow for both returning and new users
    const signedIn = await signIn(email.trim(), password);
    if (!signedIn.error) {
      setLoading(false);
      return;
    }

    const created = await signUp(email.trim(), password);
    if (!created.error) {
      // After signup, try sign in so they land in the app
      await signIn(email.trim(), password);
      setLoading(false);
      return;
    }

    setLoading(false);
    setError(signedIn.error || created.error);
  };

  const socialStub = (name: string) => {
    setError(`${name} sign in is coming soon. Use email or Bypass Login for now.`);
  };

  return (
    <div className="h-full min-h-0 bg-ark-navy-950 flex relative overflow-hidden">
      <AuthAmbientOrbs />

      <TypewriterHero />

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] animate-fade-in">
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-[0.2em] text-content-primary">ARK</h1>
          </div>

          <div className="rounded-2xl border border-surface-border bg-ark-navy-900/90 p-7 sm:p-8 shadow-2xl animate-slide-up backdrop-blur-sm">
            <div className="text-center mb-7">
              <h2 className="text-2xl font-semibold text-content-primary tracking-tight">
                Sign into your account
              </h2>
            </div>

            <div className="flex items-center justify-center gap-2.5 mb-6">
              <SocialIconButton label="Google" onClick={() => socialStub('Google')}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                  <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z" />
                  <path fill="#34A853" d="M6.6 14.3l-.7.5-2.3 1.8C5.3 19.5 8.4 21.5 12 21.5c2.4 0 4.4-.8 5.9-2.1l-3.1-2.4c-.8.6-1.9.9-2.8.9-2.2 0-4-1.5-4.7-3.5z" />
                  <path fill="#4A90E2" d="M3.6 7.4C3 8.6 2.7 9.9 2.7 11.3c0 1.4.3 2.7.9 3.9l3-2.3c-.2-.5-.3-1.1-.3-1.6 0-.6.1-1.1.3-1.6L3.6 7.4z" />
                  <path fill="#FBBC05" d="M12 5.1c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 2.3 14.4 1.5 12 1.5 8.4 1.5 5.3 3.5 3.6 6.6l3 2.3C7.9 6.6 9.8 5.1 12 5.1z" />
                </svg>
              </SocialIconButton>
              <SocialIconButton label="Apple" onClick={() => socialStub('Apple')}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-content-primary" aria-hidden>
                  <path d="M16.7 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.7.8-3.5 2.1-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.1-2.4-.1 0-2.2-.8-2.2-3.5zM14.5 5.8c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 1.9-.5 2.5-1.2z" />
                </svg>
              </SocialIconButton>
              <SocialIconButton label="Microsoft" onClick={() => socialStub('Microsoft')}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                  <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
                  <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
                  <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
                  <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
                </svg>
              </SocialIconButton>
              <SocialIconButton label="GitHub" onClick={() => socialStub('GitHub')}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-content-primary" aria-hidden>
                  <path d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.9 9.6.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.4-3.4-1.4-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1 .7-.2 1.5-.3 2.3-.3s1.6.1 2.3.3c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.6C22 6.6 17.5 2 12 2z" />
                </svg>
              </SocialIconButton>
              <SocialIconButton label="Twitter" onClick={() => socialStub('Twitter')}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                  <path fill="#1DA1F2" d="M22 5.8c-.7.3-1.4.5-2.2.6.8-.5 1.4-1.2 1.7-2.1-.7.5-1.6.8-2.4 1-1.4-1.5-3.8-1.6-5.3-.2-1 1-1.3 2.4-.8 3.7-3.1-.2-5.9-1.6-7.8-4-.9 1.6-.5 3.6 1.1 4.6-.6 0-1.2-.2-1.7-.5 0 1.8 1.3 3.4 3.1 3.7-.6.1-1.1.1-1.7 0 .5 1.5 1.9 2.6 3.6 2.6-1.5 1.2-3.4 1.8-5.3 1.6 1.8 1.1 3.9 1.7 6 1.7 7.2 0 11.2-6.1 11-11.5.7-.5 1.4-1.2 1.9-2z" />
                </svg>
              </SocialIconButton>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-surface-border" />
              <span className="text-[10px] uppercase tracking-[0.16em] text-content-tertiary whitespace-nowrap">
                Or continue with email
              </span>
              <div className="flex-1 h-px bg-surface-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (showPasswordStep) setShowPasswordStep(false);
                  }}
                  onKeyDown={handleEmailKeyDown}
                  placeholder="name@example.com"
                  className="ark-input pl-10 pr-12 h-12 rounded-xl"
                  autoComplete="email"
                />
                {!showPasswordStep && (
                  <button
                    type="button"
                    onClick={advanceFromEmail}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-content-primary text-ark-navy-950 flex items-center justify-center hover:opacity-90 transition-opacity"
                    aria-label="Continue"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showPasswordStep && (
                <div className="relative animate-fade-in">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="ark-input pl-10 pr-12 h-12 rounded-xl"
                    autoComplete="current-password"
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
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-ark-accent-red bg-ark-accent-red/10 border border-ark-accent-red/20 rounded-xl px-3 py-2.5 animate-fade-in">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {showPasswordStep && (
                <button type="submit" disabled={loading} className="ark-btn-primary w-full h-11 rounded-xl">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Continue
                </button>
              )}
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
                    title="Sign in as guest, then run speed and hardware setup"
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
            {lastAuth && (
              <p className="text-[11px] text-content-tertiary text-center mt-3 leading-relaxed">
                Last time: {lastAuth.method === 'bypass' ? 'Guest on this device' : lastAuth.email || 'account'}
                {lastAuth.at ? ` · ${new Date(lastAuth.at).toLocaleDateString()}` : ''}.
              </p>
            )}

            <p className="text-center text-[11px] text-content-tertiary mt-5 leading-relaxed">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
