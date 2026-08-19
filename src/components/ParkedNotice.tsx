import { FlaskConical } from 'lucide-react';
import type { ParkId } from '@/lib/featurePark';

const COPY: Record<'networking' | 'message' | 'call', { title: string; body: string }> = {
  networking: {
    title: 'Networking is not enabled yet',
    body: 'This feature is wired but parked on your PC. Turn it on under Settings → Testers when you want the feed.',
  },
  message: {
    title: 'Message is not enabled yet',
    body: 'Direct messages are wired but parked. Reveal Message under Settings → Testers — not a broken app.',
  },
  call: {
    title: 'Call is not enabled yet',
    body: 'Voice calls are wired but parked (microphone + WebRTC). Reveal Call under Settings → Testers when ready.',
  },
};

export function ParkedNotice({ feature }: { feature: Exclude<ParkId, 'testers'> }) {
  const copy = COPY[feature];
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-3">
        <div className="w-10 h-10 mx-auto rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center">
          <FlaskConical className="w-4 h-4 text-content-secondary" />
        </div>
        <h1 className="text-lg font-semibold text-content-primary">{copy.title}</h1>
        <p className="text-sm text-content-tertiary leading-relaxed">{copy.body}</p>
        <p className="text-xs text-content-tertiary">Settings → Testers → turn it on for this device.</p>
        <button
          type="button"
          className="ark-btn-primary text-xs"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('ark:open-settings', { detail: { section: 'testers' } }));
          }}
        >
          Open Testers
        </button>
      </div>
    </div>
  );
}
