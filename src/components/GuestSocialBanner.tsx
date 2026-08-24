import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const DISMISS_KEY = 'ark:guest-social-banner-dismiss';

type Props = {
  feature: 'networking' | 'message' | 'call';
};

const COPY: Record<Props['feature'], string> = {
  networking: 'Posts on this PC stay local until you sign in. Sign in to share work with other ARK IDs on the network.',
  message: 'Messages are saved on this PC as Guest. Sign in to reach other people by ARK ID across devices.',
  call: 'Voice calls need sign-in so ARK can route to your ARK ID. You can still browse contacts locally as Guest.',
};

export function GuestSocialBanner({ feature }: Props) {
  const { user, bypass } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(`${DISMISS_KEY}:${feature}`) === '1'; } catch { return false; }
  });
  const isGuest = bypass || user?.id === 'guest-local';
  if (!isGuest || dismissed) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 leading-relaxed flex items-start justify-between gap-3">
      <div>
        <span className="font-medium text-amber-200">Guest mode</span>
        {'. '}
        {COPY[feature]}
        {' '}
        <span className="text-amber-200/80">Settings → Sign in</span>
      </div>
      <button
        type="button"
        className="text-xs text-amber-200/80 hover:text-amber-100 shrink-0"
        onClick={() => {
          setDismissed(true);
          try { localStorage.setItem(`${DISMISS_KEY}:${feature}`, '1'); } catch { /* ignore */ }
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
