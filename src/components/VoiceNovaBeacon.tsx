import type { VoiceSessionPhase } from '@/lib/voiceMode';
import { VoiceDotCircle } from '@/components/VoiceDotCircle';

/** Invisible hit target over the sphere — no status label in the middle. */
export function VoiceNovaBeacon(_props: { phase: VoiceSessionPhase }) {
  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <div className="relative w-[min(34vw,11.2rem)] h-[min(34vw,11.2rem)] sm:w-[min(29vw,12.8rem)] sm:h-[min(29vw,12.8rem)]" />
    </div>
  );
}

/** Active voice field — white sphere of dots. */
export function VoiceParticleField({ phase }: { phase: VoiceSessionPhase }) {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
      <VoiceDotCircle phase={phase} />
    </div>
  );
}
