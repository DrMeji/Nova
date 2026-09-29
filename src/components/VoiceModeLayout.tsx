import { type ReactNode } from 'react';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import { VoiceNovaBeacon, VoiceParticleField } from '@/components/VoiceNovaBeacon';

const PHASE_LABEL: Record<VoiceSessionPhase, string> = {
  idle: 'Type below or use the mic, then press Enter',
  listening: 'Listening…',
  transcribing: 'Got it…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Try again',
};

type VoiceFaceProps = {
  phase: VoiceSessionPhase;
};

/** Decorative focal — interaction is mic → box → Enter, not orb tap. */
export function VoiceFace({ phase }: VoiceFaceProps) {
  return (
    <div
      className="relative z-10 flex flex-col items-center justify-center select-none pointer-events-none"
      aria-label={PHASE_LABEL[phase]}
    >
      <VoiceNovaBeacon phase={phase} />
      <span className="sr-only">{PHASE_LABEL[phase]}</span>
    </div>
  );
}

type VoiceModeLayoutProps = {
  phase: VoiceSessionPhase;
  onActivate?: () => void;
  busy?: boolean;
  composer: ReactNode;
  brainHint?: ReactNode;
};

/** Voice tab — ring + composer. Viz controls live in Settings → Voice. */
export function VoiceModeLayout({ phase, composer, brainHint }: VoiceModeLayoutProps) {
  return (
    <div className="relative flex-1 flex flex-col min-h-0 w-full items-center overflow-hidden">
      <VoiceParticleField phase={phase} />
      <div className="relative z-10 flex-1 flex flex-col items-center min-h-0 w-full pt-[min(10vh,4.5rem)] pb-[min(28vh,11rem)] justify-start sm:pt-[min(12vh,5.5rem)]">
        <VoiceFace phase={phase} />
        {brainHint ? (
          <div className="mt-4 w-full max-w-md px-4 sm:px-0">
            {brainHint}
          </div>
        ) : null}
      </div>
      <div className="relative z-10 shrink-0 px-4 sm:px-8 pb-10 sm:pb-12 pt-1 max-w-3xl mx-auto w-full">
        {composer}
      </div>
    </div>
  );
}
