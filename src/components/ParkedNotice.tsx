import { FlaskConical } from 'lucide-react';
import type { ParkId } from '@/lib/featurePark';

const COPY: Record<'networking' | 'message' | 'call', { title: string; body: string }> = {
  networking: {
    title: 'Networking is parked',
    body: 'The feed is wired and ready, but it stays hidden until you reveal it on this PC.',
  },
  message: {
    title: 'Message is parked',
    body: 'Direct messages are wired and ready, but they stay hidden until you reveal them on this PC.',
  },
  call: {
    title: 'Call is parked',
    body: 'Voice calls are wired and ready (microphone + WebRTC). Reveal Call when you want it on this PC.',
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
