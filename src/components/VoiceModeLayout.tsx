import { type ReactNode } from 'react';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import { VoiceArkFace } from '@/components/VoiceArkFace';

const PHASE_LABEL: Record<VoiceSessionPhase, string> = {
  idle: 'Tap ARK or type below',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Tap ARK to try again',
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
      <VoiceArkFace
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

/** Voice tab — ARK face up top, chat composer at bottom, no on-screen history. */
export function VoiceModeLayout({ phase, onActivate, busy, composer, brainHint }: VoiceModeLayoutProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 pb-6 pt-2">
        <VoiceFace phase={phase} onActivate={onActivate} activateBlocked={busy} />
        {brainHint ? (
          <div className="mt-5 w-full max-w-md px-4 sm:px-0">
            {brainHint}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 px-4 sm:px-8 pb-6 pt-2 max-w-3xl mx-auto w-full">
        {composer}
      </div>
    </div>
  );
}
