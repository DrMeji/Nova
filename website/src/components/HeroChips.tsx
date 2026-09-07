import { useEffect, useState, type CSSProperties } from 'react';

const CHIPS = [
  { label: 'Local brain ready', live: true },
  { label: 'Free keys · Auto route', live: false },
  { label: 'Projects on disk', live: false },
  { label: 'Friends by NOVA ID', live: false },
  { label: 'Plugins connected', live: false },
  { label: 'Chat offline with a local brain', live: true },
  { label: 'Models install', live: false },
  { label: 'Private by default', live: false },
];

/** Angles (deg) so each chip pops outward from center on its own ray. */
const ANGLES = [-70, -25, 20, 70, 115, 160, -115, -160];

const CYCLE_MS = 2100;

export function HeroChips() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    const outTimer = window.setTimeout(() => setPhase('out'), 1450);
    const nextTimer = window.setTimeout(() => {
      setIndex(i => (i + 1) % CHIPS.length);
      setPhase('in');
    }, CYCLE_MS);
    return () => {
      window.clearTimeout(outTimer);
      window.clearTimeout(nextTimer);
    };
  }, [index]);

  const chip = CHIPS[index];
  const angle = (ANGLES[index % ANGLES.length] * Math.PI) / 180;
  const dist = 148;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;

  const style = {
    '--chip-x': `${x}px`,
    '--chip-y': `${y}px`,
  } as CSSProperties;

  return (
    <div className="hero-float-layer" aria-hidden>
      <div
        key={index}
        className={`hero-chip hero-chip-active ${phase === 'in' ? 'is-in' : 'is-out'}`}
        style={style}
      >
        {chip.live ? <span className="chip-dot" /> : null}
        {chip.label}
      </div>
    </div>
  );
}
