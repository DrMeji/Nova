import { type ReactNode } from 'react';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import { VoiceNovaBeacon } from '@/components/VoiceNovaBeacon';

const PHASE_LABEL: Record<VoiceSessionPhase, string> = {
  idle: 'Tap NOVA or type below',
  listening: 'Listening…',
  transcribing: 'Got it…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Tap NOVA to try again',
};

type VoiceFaceProps = {
  phase: VoiceSessionPhase;
  onActivate: () => void;
  activateBlocked?: boolean;
};

export function VoiceFace({ phase, onActivate, activateBlocked }: VoiceFaceProps) {
  const handleClick = () => {
    if (activateBlocked) return;
    onActivate();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="group relative flex flex-col items-center justify-center bg-transparent border-0 p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent rounded-xl"
      aria-label={PHASE_LABEL[phase]}
      aria-busy={activateBlocked || undefined}
    >
      <VoiceNovaBeacon
        phase={phase}
        className="w-56 h-56 sm:w-72 sm:h-72 lg:w-80 lg:h-80 transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <span className="sr-only">{PHASE_LABEL[phase]}</span>
    </div>
  );
}

type VoiceModeLayoutProps = {
  phase: VoiceSessionPhase;
  onActivate: () => void;
  busy?: boolean;
  composer: ReactNode;
  brainHint?: ReactNode;
};

/** Voice tab — Nova beacon raised in the viewport, composer lifted off the bottom edge. */
export function VoiceModeLayout({ phase, onActivate, busy, composer, brainHint }: VoiceModeLayoutProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 pb-2 pt-4 sm:pt-6 -mt-6 sm:-mt-10">
        <VoiceFace phase={phase} onActivate={onActivate} activateBlocked={busy} />
        {brainHint ? (
          <div className="mt-4 w-full max-w-md px-4 sm:px-0">
            {brainHint}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 px-4 sm:px-8 pb-10 sm:pb-12 pt-1 max-w-3xl mx-auto w-full">
        {composer}
      </div>
    </div>
  );
}
