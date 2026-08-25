import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X } from 'lucide-react';

const DISMISS_KEY = 'ark:post-login-safety-tip';

/** One-time tip after sign-in: Windows may show firewall / SmartScreen — safe to minimize. */
export function PostLoginSafetyTip() {
  const { user, bypass, loading } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (loading || dismissed || bypass || !user || user.id === 'guest-local') return null;

  return (
    <div className="shrink-0 mx-2 mt-2 mb-0 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1 text-xs text-sky-100/90 leading-relaxed">
        <p className="font-medium text-sky-200 text-sm">You&apos;re signed in</p>
        <p className="mt-1">
          If Windows shows a firewall, SmartScreen, or similar warning for ARK or the local brain, you can{' '}
          <strong className="font-medium text-sky-100">minimize that window</strong> and keep using the app.
          Those prompts are normal on first run — they are not a failed login.
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 p-1 rounded-lg text-sky-200/70 hover:text-sky-100 hover:bg-sky-500/20"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            /* ignore */
          }
        }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
