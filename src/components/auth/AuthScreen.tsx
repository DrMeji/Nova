import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AlertCircle, Check, Copy, Loader2, Zap } from 'lucide-react';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';
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

function GitHubMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function AuthScreen() {
  const { signInWithGitHub, bypassLogin } = useAuth();
  const [showBypass, setShowBypass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsClientId, setNeedsClientId] = useState(false);
  const [clientIdDraft, setClientIdDraft] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [deviceUserCode, setDeviceUserCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    void window.novaDesktop?.appMeta?.()
      .then(meta => {
        setShowBypass(!meta?.isPackaged);
      })
      .catch(() => setShowBypass(false));
  }, []);

  useEffect(() => {
    void window.novaDesktop?.pluginOAuthStatus?.()
      .then(s => {
        if (s?.ok && s.github === false) setNeedsClientId(true);
        const stored = s?.stored?.github;
        if (stored) setClientIdDraft(stored);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsub = window.novaDesktop?.onPluginOAuthProgress?.((payload) => {
      if (payload?.cancelled) {
        setDeviceUserCode(null);
        return;
      }
      if (payload?.userCode) {
        setDeviceUserCode(String(payload.userCode));
        setInfo(payload.message || 'Enter this code on GitHub, then Authorize.');
      } else if (payload?.mode === 'browser' && payload.message) {
        setDeviceUserCode(null);
        setInfo(payload.message);
      }
    });
    return () => {
      try { unsub?.(); } catch { /* ignore */ }
    };
  }, []);

  const saveClientId = async () => {
    const id = clientIdDraft.trim();
    if (!id) {
      setError('Paste your GitHub OAuth App Client ID or a personal access token first.');
      return false;
    }
    if (/^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/i.test(id)) {
      setNeedsClientId(false);
      return true;
    }
    if (!window.novaDesktop?.pluginOAuthSetClient) {
      setError('Saving a Client ID needs the NOVA desktop app.');
      return false;
    }
    setSavingClient(true);
    setError(null);
    try {
      const res = await window.novaDesktop.pluginOAuthSetClient('github', id);
      if (!res?.ok) {
        setError(res?.message || 'Could not save the Client ID. Try again.');
        return false;
      }
      setNeedsClientId(false);
      setInfo('Client ID saved. Continue with GitHub when you are ready.');
      return true;
    } catch {
      setError('Could not save the Client ID. Try again.');
      return false;
    } finally {
      setSavingClient(false);
    }
  };

  const handleCancel = () => {
    void window.novaDesktop?.pluginOAuthCancel?.();
    setLoading(false);
    setSavingClient(false);
    setDeviceUserCode(null);
    setCodeCopied(false);
    setInfo(null);
    setError(null);
  };

  const handleGitHub = async () => {
    setError(null);
    setDeviceUserCode(null);
    setCodeCopied(false);
    const draft = clientIdDraft.trim();
    const draftIsPat = /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/i.test(draft);
    setInfo(draftIsPat
      ? 'Verifying your GitHub token…'
      : 'Opening GitHub in your browser…');
    setLoading(true);
    try {
      if (needsClientId && draft && !draftIsPat) {
        const saved = await saveClientId();
        if (!saved) {
          setInfo(null);
          return;
        }
      }
      if (needsClientId && !draft) {
        setError('Paste your GitHub OAuth Client ID or a personal access token first.');
        setInfo(null);
        return;
      }
      const res = await signInWithGitHub(draftIsPat ? { accessToken: draft } : undefined);
      if (res.cancelled) {
        setInfo(null);
        setDeviceUserCode(null);
        return;
      }
      if (res.error) {
        setError(res.error);
        setInfo(null);
        setDeviceUserCode(null);
        if (res.needsConfig) setNeedsClientId(true);
      } else if (draftIsPat) {
        setClientIdDraft('');
      }
    } finally {
      setLoading(false);
      setDeviceUserCode(null);
    }
  };

  return (
    <div className="h-full min-h-0 bg-nova-navy-950 flex relative overflow-hidden">
      <AuthAmbientOrbs />
      <TypewriterHero />

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] animate-fade-in">
          <div className="lg:hidden text-center mb-8">
            <NovaMark className="w-10 h-10 text-content-primary mx-auto" title="NOVA" />
          </div>

          <div className="rounded-2xl border border-surface-border bg-nova-navy-900 p-7 sm:p-8 shadow-2xl animate-slide-up">
            <div className="mb-6 text-center">
              <p className="text-lg font-semibold text-content-primary tracking-tight">Continue with GitHub</p>
              <p className="mt-1.5 text-sm text-content-tertiary leading-relaxed">
                Secure access to your studio and projects.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-nova-accent-red bg-nova-accent-red/10 border border-nova-accent-red/20 rounded-xl px-3 py-2.5 mb-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {info && !error && (
              <div className="flex items-start gap-2 text-sm text-violet-200/90 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2.5 mb-3">
                <span>{info}</span>
              </div>
            )}

            {deviceUserCode && loading && (
              <button
                type="button"
                title={codeCopied ? 'Copied' : 'Click to copy'}
                aria-label={codeCopied ? 'Copied' : 'Copy GitHub device code'}
                onClick={() => {
                  void navigator.clipboard.writeText(deviceUserCode).then(() => {
                    setCodeCopied(true);
                    window.setTimeout(() => setCodeCopied(false), 1600);
                  }).catch(() => undefined);
                }}
                className="group mb-4 w-full rounded-xl border border-surface-border bg-nova-navy-950/80 px-4 py-3 text-center hover:border-sky-400/40 hover:bg-surface-hover/40 transition-colors cursor-pointer"
              >
                <p className="text-[11px] text-content-tertiary mb-1.5">
                  {codeCopied ? 'Copied' : 'Enter this code on GitHub · click to copy'}
                </p>
                <span className="inline-flex items-center justify-center gap-2.5">
                  <span className="text-2xl font-mono tracking-[0.2em] text-content-primary">
                    {deviceUserCode}
                  </span>
                  <span className="opacity-50 group-hover:opacity-100 transition-opacity text-content-tertiary group-hover:text-content-secondary">
                    {codeCopied
                      ? <Check className="w-4 h-4 text-emerald-400" />
                      : <Copy className="w-4 h-4" />}
                  </span>
                </span>
              </button>
            )}

            {needsClientId && !loading && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-content-secondary">GitHub Client ID (one-time setup)</label>
                  <button
                    type="button"
                    className="text-[11px] text-sky-400 hover:text-sky-300"
                    onClick={() => void window.novaDesktop?.openExternal?.('https://github.com/settings/developers')}
                  >
                    Open OAuth Apps
                  </button>
                </div>
                <input
                  type="password"
                  value={clientIdDraft}
                  onChange={e => setClientIdDraft(e.target.value)}
                  placeholder="OAuth Client ID (not a PAT)"
                  autoComplete="off"
                  spellCheck={false}
                  className="nova-input w-full text-sm"
                  disabled={savingClient}
                />
                <p className="text-[11px] text-content-tertiary leading-relaxed">
                  Publisher only — end users never paste this. Add redirect URI{' '}
                  <span className="font-mono text-content-secondary">http://127.0.0.1:17887/callback</span>
                  {' '}on the OAuth App for one-click Authorize.
                </p>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  disabled
                  className="nova-btn-primary w-full h-12 rounded-xl gap-2.5 text-[15px] font-medium opacity-90"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Waiting for GitHub…
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="nova-btn-secondary h-12 rounded-xl px-4"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={savingClient}
                onClick={() => void handleGitHub()}
                className="nova-btn-primary w-full h-12 rounded-xl gap-2.5 text-[15px] font-medium"
              >
                {savingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitHubMark />}
                {savingClient ? 'Saving…' : 'Continue with GitHub'}
              </button>
            )}

            <p className="text-center text-[11px] text-content-tertiary mt-4 leading-relaxed">
              By continuing, you agree to our{' '}
              <button
                type="button"
                className="underline hover:text-content-secondary"
                onClick={() => void window.novaDesktop?.openExternal?.('https://github.com/DrMeji/Nova/blob/main/README.md')}
              >
                Terms of Service
              </button>
              {' '}and{' '}
              <button
                type="button"
                className="underline hover:text-content-secondary"
                onClick={() => void window.novaDesktop?.openExternal?.('https://github.com/DrMeji/Nova/blob/main/README.md')}
              >
                Privacy Policy
              </button>
            </p>
          </div>

          <p className="mt-3 text-right text-[11px] text-content-tertiary/70 tracking-wide">
            Powered by Lotus
          </p>

          {showBypass && (
            <div className="mt-8 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => bypassLogin({ skipSetup: false })}
                disabled={loading}
                className="nova-btn-secondary h-11 rounded-xl px-2"
                title="Dev only: sign in as guest, then run hardware setup"
              >
                <Zap className="w-3.5 h-3.5 text-nova-accent-amber shrink-0" />
                <span className="text-xs leading-tight text-left">Bypass + Setup</span>
              </button>
              <button
                type="button"
                onClick={() => bypassLogin({ skipSetup: true })}
                disabled={loading}
                className="nova-btn-secondary h-11 rounded-xl px-2"
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
