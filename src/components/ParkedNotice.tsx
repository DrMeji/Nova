import { Clock } from 'lucide-react';
import type { ParkId } from '@/lib/featurePark';

const LABEL: Record<'networking' | 'message' | 'call', string> = {
  networking: 'Networking',
  message: 'Message',
  call: 'Call',
};

export function ParkedNotice({ feature }: { feature: Exclude<ParkId, 'testers'> }) {
  const label = LABEL[feature];
  return (
    <div className="h-full w-full relative overflow-hidden">
      {/* blurred background placeholder */}
      <div className="absolute inset-0 bg-ark-navy-950/60 backdrop-blur-md" />
      {/* "Coming Soon" card centred on top */}
      <div className="absolute inset-0 flex items-center justify-center p-8 z-10">
        <div className="max-w-xs w-full text-center space-y-4 rounded-2xl border border-surface-border bg-ark-navy-900/90 shadow-2xl px-8 py-10">
          <div className="w-12 h-12 mx-auto rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-sky-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-content-primary">{label}</h2>
            <p className="text-[13px] text-sky-400 font-medium">Coming Soon</p>
          </div>
          <p className="text-xs text-content-tertiary leading-relaxed">
            This feature is being built. Check back in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}
