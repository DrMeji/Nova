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
 * Nova-native voice focal point — circuit mark in a soft orbital field.
 * Replaces the old “screen head” box.
 */
export function VoiceNovaBeacon({ phase, className = '' }: VoiceNovaBeaconProps) {
  const active = phase === 'listening' || phase === 'speaking' || phase === 'thinking' || phase === 'transcribing';
  const urgent = phase === 'error';

  return (
    <div className={`relative flex flex-col items-center justify-center select-none ${className}`}>
      <div
        className={`absolute inset-[12%] rounded-full blur-2xl transition-opacity duration-500 ${
          urgent
            ? 'bg-rose-500/25 opacity-100'
            : active
              ? 'bg-sky-400/20 opacity-100'
              : 'bg-white/5 opacity-70'
        }`}
        aria-hidden
      />
      <div
        className={`relative flex items-center justify-center w-[58%] h-[58%] rounded-full border transition-all duration-300 ${
          urgent
            ? 'border-rose-400/50 bg-ark-navy-900/80'
            : active
              ? 'border-sky-400/40 bg-ark-navy-900/70 shadow-[0_0_40px_rgba(56,189,248,0.18)]'
              : 'border-white/10 bg-ark-navy-900/60'
        } ${phase === 'listening' ? 'scale-105' : phase === 'speaking' ? 'scale-[1.03]' : ''}`}
      >
        <NovaMark
          className={`w-[46%] h-[46%] transition-colors duration-300 ${
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
