import type { VoiceSessionPhase } from '@/lib/voiceMode';
import { NovaMark } from '@/components/NovaMark';

type VoiceNovaBeaconProps = {
  phase: VoiceSessionPhase;
  className?: string;
};

const PHASE_HINT: Record<VoiceSessionPhase, string> = {
  idle: 'Ready',
  listening: 'Listening',
  transcribing: 'Hearing you',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Try again',
};

/**
 * Nova-native voice focal point — circuit mark in a clean outer ring.
 * Tree animates while the AI is thinking / speaking; no outer glow.
 */
export function VoiceNovaBeacon({ phase, className = '' }: VoiceNovaBeaconProps) {
  const active = phase === 'listening' || phase === 'speaking' || phase === 'thinking' || phase === 'transcribing';
  const urgent = phase === 'error';
  const treeMotion =
    phase === 'speaking'
      ? 'nova-mark-speaking'
      : phase === 'thinking' || phase === 'transcribing' || phase === 'listening'
        ? 'nova-mark-thinking'
        : '';

  return (
    <div className={`relative flex flex-col items-center justify-center select-none ${className}`}>
      <div
        className={`relative flex items-center justify-center w-[58%] h-[58%] rounded-full border transition-colors duration-300 ${
          urgent
            ? 'border-rose-400/50 bg-transparent'
            : active
              ? 'border-sky-400/40 bg-transparent'
              : 'border-white/10 bg-transparent'
        }`}
      >
        <NovaMark
          className={`w-[46%] h-[46%] transition-colors duration-300 ${treeMotion} ${
            urgent ? 'text-rose-300' : active ? 'text-sky-100' : 'text-content-primary'
          }`}
          title="NOVA"
        />
      </div>
      <p
        className={`mt-5 text-xs tracking-[0.18em] uppercase ${
          urgent ? 'text-rose-300/90' : 'text-content-tertiary'
        }`}
      >
        {PHASE_HINT[phase]}
      </p>
    </div>
  );
}
