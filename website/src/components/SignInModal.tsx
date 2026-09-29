import { useAuth } from '../lib/auth';
import { NovaMark } from './NovaMark';

/**
 * Website account modal — email/password retired.
 * Desktop NOVA uses Continue with GitHub; this modal only points people there.
 */
export function SignInModal() {
  const { signInOpen, closeSignIn } = useAuth();

  if (!signInOpen) return null;

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" className="auth-scrim" aria-label="Close" onClick={closeSignIn} />
      <div className="auth-panel">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5 text-[var(--fg)]">
            <NovaMark size={28} />
            <h2 id="auth-title" className="display text-xl font-semibold tracking-tight">
              Sign in with GitHub
            </h2>
          </div>
          <button type="button" className="auth-close" onClick={closeSignIn} aria-label="Close">
            ×
          </button>
        </div>

        <p className="text-sm text-[var(--fg-muted)] mb-5 leading-relaxed">
          NOVA accounts are GitHub-only. Open the desktop app and choose{' '}
          <strong className="text-[var(--fg)] font-medium">Continue with GitHub</strong>
          {' '}— that also connects your repositories.
        </p>

        <a
          href="https://github.com/DrMeji/Nova/releases"
          className="auth-submit"
          onClick={closeSignIn}
        >
          Download NOVA
        </a>
      </div>
    </div>
  );
}
