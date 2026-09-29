import { useEffect, useState } from 'react';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import { VoiceParticleRing, voicePhaseEnergy } from '@/components/VoiceParticleRing';

/** Invisible hit target over the ring — no status label in the middle. */
export function VoiceNovaBeacon(_props: { phase: VoiceSessionPhase }) {
  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <div className="relative w-[min(34vw,11.2rem)] h-[min(34vw,11.2rem)] sm:w-[min(29vw,12.8rem)] sm:h-[min(29vw,12.8rem)]" />
    </div>
  );
}

export function VoiceParticleField({ phase }: { phase: VoiceSessionPhase }) {
  const [energy, setEnergy] = useState(() => voicePhaseEnergy(phase));

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      setEnergy(voicePhaseEnergy(phase, t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
      <VoiceParticleRing energy={energy} phase={phase} />
    </div>
  );
}
