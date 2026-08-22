import { useEffect, useRef } from 'react';

type OrbSpec = {
  size: number;
  colorClass: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const ORB_SETUP: Array<{ size: number; colorClass: string }> = [
  { size: 420, colorClass: 'auth-orb-tone-a' },
  { size: 300, colorClass: 'auth-orb-tone-b' },
  { size: 240, colorClass: 'auth-orb-tone-c' },
  { size: 170, colorClass: 'auth-orb-tone-d' },
  { size: 210, colorClass: 'auth-orb-tone-e' },
  { size: 140, colorClass: 'auth-orb-tone-f' },
  { size: 190, colorClass: 'auth-orb-tone-g' },
  { size: 260, colorClass: 'auth-orb-tone-h' },
  { size: 155, colorClass: 'auth-orb-tone-i' },
];

/** Soft px/frame — slow roam, still readable */
const SPEED_MIN = 0.22;
const SPEED_MAX = 0.42;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function seedOrbs(w: number, h: number): OrbSpec[] {
  const maxR = Math.min(w, h) * 0.28;
  return ORB_SETUP.map((spec, i) => {
    const size = Math.min(spec.size, maxR * 2);
    const r = size / 2;
    const angle = (i / ORB_SETUP.length) * Math.PI * 2 + rand(-0.4, 0.4);
    const speed = rand(SPEED_MIN, SPEED_MAX);
    return {
      size,
      colorClass: spec.colorClass,
      x: rand(r, Math.max(r + 1, w - r)),
      y: rand(r, Math.max(r + 1, h - r)),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  });
}

function bounceWalls(orb: OrbSpec, w: number, h: number) {
  const r = orb.size / 2;
  if (orb.x - r < 0) {
    orb.x = r;
    orb.vx = Math.abs(orb.vx);
  } else if (orb.x + r > w) {
    orb.x = w - r;
    orb.vx = -Math.abs(orb.vx);
  }
  if (orb.y - r < 0) {
    orb.y = r;
    orb.vy = Math.abs(orb.vy);
  } else if (orb.y + r > h) {
    orb.y = h - r;
    orb.vy = -Math.abs(orb.vy);
  }
}

function bouncePair(a: OrbSpec, b: OrbSpec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const minDist = a.size / 2 + b.size / 2;
  if (dist >= minDist) return;

  const overlap = (minDist - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const massA = a.size;
  const massB = b.size;
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const vn = dvx * nx + dvy * ny;
  if (vn > 0) return;

  const impulse = (2 * vn) / (massA + massB);
  a.vx -= impulse * massB * nx;
  a.vy -= impulse * massB * ny;
  b.vx += impulse * massA * nx;
  b.vy += impulse * massA * ny;

  for (const orb of [a, b]) {
    const s = Math.hypot(orb.vx, orb.vy);
    if (s < SPEED_MIN) {
      const scale = SPEED_MIN / (s || 0.001);
      orb.vx *= scale;
      orb.vy *= scale;
    } else if (s > SPEED_MAX * 1.4) {
      const scale = (SPEED_MAX * 1.15) / s;
      orb.vx *= scale;
      orb.vy *= scale;
    }
  }
}

function paintOrbs(orbs: OrbSpec[], orbEls: (HTMLDivElement | null)[]) {
  for (let i = 0; i < orbs.length; i++) {
    const el = orbEls[i];
    if (!el) continue;
    const orb = orbs[i];
    el.style.width = `${orb.size}px`;
    el.style.height = `${orb.size}px`;
    el.style.transform = `translate3d(${orb.x - orb.size / 2}px, ${orb.y - orb.size / 2}px, 0)`;
  }
}

export function AuthAmbientOrbs() {
  const layerRef = useRef<HTMLDivElement>(null);
  const orbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stateRef = useRef<OrbSpec[] | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    // Soft ambient drift always runs — Windows "reduce motion" used to freeze
    // orbs in place (or hide them). Login atmosphere should keep moving slowly.
    const ensureSeeded = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (w < 2 || h < 2) return false;
      if (!stateRef.current) {
        stateRef.current = seedOrbs(w, h);
      } else {
        for (const orb of stateRef.current) {
          bounceWalls(orb, w, h);
        }
      }
      paintOrbs(stateRef.current, orbRefs.current);
      return true;
    };

    const tick = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      const orbs = stateRef.current;
      if (!orbs) {
        ensureSeeded();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        bounceWalls(orb, w, h);
      }

      for (let i = 0; i < orbs.length; i++) {
        for (let j = i + 1; j < orbs.length; j++) {
          bouncePair(orbs[i], orbs[j]);
        }
      }

      paintOrbs(orbs, orbRefs.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    ensureSeeded();
    rafRef.current = requestAnimationFrame(tick);
    const ro = new ResizeObserver(() => {
      ensureSeeded();
    });
    ro.observe(layer);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={layerRef} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {ORB_SETUP.map((spec, i) => (
        <div
          key={spec.colorClass}
          ref={el => {
            orbRefs.current[i] = el;
          }}
          className={`auth-orb ${spec.colorClass}`}
          style={{
            width: spec.size,
            height: spec.size,
            transform: 'translate3d(-9999px, -9999px, 0)',
          }}
        />
      ))}
    </div>
  );
}
