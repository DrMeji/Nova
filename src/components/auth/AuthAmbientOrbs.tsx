import { useCallback, useEffect, useRef } from 'react';

function isReduceMotionOn(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.reduceMotion === '1' || root.classList.contains('reduce-motion');
}

type OrbSpec = {
  size: number;
  colorClass: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const ORB_SETUP: Array<{ size: number; colorClass: string }> = [
  { size: 280, colorClass: 'auth-orb-tone-a' },
  { size: 220, colorClass: 'auth-orb-tone-b' },
  { size: 200, colorClass: 'auth-orb-tone-c' },
  { size: 160, colorClass: 'auth-orb-tone-d' },
  { size: 190, colorClass: 'auth-orb-tone-e' },
  { size: 150, colorClass: 'auth-orb-tone-f' },
  { size: 175, colorClass: 'auth-orb-tone-g' },
  { size: 210, colorClass: 'auth-orb-tone-h' },
  { size: 165, colorClass: 'auth-orb-tone-i' },
];

/** App shell uses all nine solid bouncing circles. */
const APP_ORB_SETUP = ORB_SETUP;

const SPEED_MIN = 0.28;
const SPEED_MAX = 0.5;
const APP_SPEED_MIN = SPEED_MIN;
const APP_SPEED_MAX = SPEED_MAX;
const ORB_SEPARATION_PAD = 18;
const CLICK_IMPULSE = 2.8;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function seedOrbs(
  w: number,
  h: number,
  setup: Array<{ size: number; colorClass: string }>,
  speedMin: number,
  speedMax: number,
): OrbSpec[] {
  const count = setup.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return setup.map((spec, i) => {
    const size = Math.min(spec.size, Math.min(w, h) * 0.34);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const r = size / 2;
    const x = cellW * (col + 0.5) + rand(-cellW * 0.12, cellW * 0.12);
    const y = cellH * (row + 0.5) + rand(-cellH * 0.12, cellH * 0.12);
    const angle = rand(0, Math.PI * 2);
    const speed = rand(speedMin, speedMax);
    return {
      size,
      colorClass: spec.colorClass,
      x: Math.min(w - r, Math.max(r, x)),
      y: Math.min(h - r, Math.max(r, y)),
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

function clampSpeed(orb: OrbSpec, speedMin: number, speedMax: number) {
  const s = Math.hypot(orb.vx, orb.vy);
  if (s < speedMin) {
    const scale = speedMin / (s || 0.001);
    orb.vx *= scale;
    orb.vy *= scale;
  } else if (s > speedMax * 1.35) {
    const scale = (speedMax * 1.2) / s;
    orb.vx *= scale;
    orb.vy *= scale;
  }
}

function bouncePair(a: OrbSpec, b: OrbSpec, speedMin: number, speedMax: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const minDist = a.size / 2 + b.size / 2 + ORB_SEPARATION_PAD;
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

  const sep = speedMin * 1.25;
  a.vx -= nx * sep;
  a.vy -= ny * sep;
  b.vx += nx * sep;
  b.vy += ny * sep;

  if (vn <= 0) {
    const impulse = (2 * vn) / (massA + massB);
    a.vx -= impulse * massB * nx;
    a.vy -= impulse * massB * ny;
    b.vx += impulse * massA * nx;
    b.vy += impulse * massA * ny;
  }

  for (const orb of [a, b]) {
    clampSpeed(orb, speedMin, speedMax);
  }
}

function paintOrbs(
  orbs: OrbSpec[],
  orbEls: (HTMLButtonElement | HTMLDivElement | null)[],
  reduceMotion: boolean,
) {
  const play = reduceMotion ? 'paused' : 'running';
  for (let i = 0; i < orbs.length; i++) {
    const el = orbEls[i];
    if (!el) continue;
    const orb = orbs[i];
    el.style.width = `${orb.size}px`;
    el.style.height = `${orb.size}px`;
    el.style.transform = `translate3d(${orb.x - orb.size / 2}px, ${orb.y - orb.size / 2}px, 0)`;
    el.style.animationPlayState = play;
  }
}

type AuthAmbientOrbsProps = {
  variant?: 'auth' | 'app';
};

export function AuthAmbientOrbs({ variant = 'auth' }: AuthAmbientOrbsProps) {
  const isApp = variant === 'app';
  const setup = isApp ? APP_ORB_SETUP : ORB_SETUP;
  const speedMin = isApp ? APP_SPEED_MIN : SPEED_MIN;
  const speedMax = isApp ? APP_SPEED_MAX : SPEED_MAX;

  const layerRef = useRef<HTMLDivElement>(null);
  const orbRefs = useRef<(HTMLButtonElement | HTMLDivElement | null)[]>([]);
  const stateRef = useRef<OrbSpec[] | null>(null);
  const rafRef = useRef(0);
  const reduceMotionRef = useRef(isReduceMotionOn());

  const kickOrb = useCallback((index: number, clientX: number, clientY: number) => {
    if (isReduceMotionOn()) return;
    const layer = layerRef.current;
    const orbs = stateRef.current;
    if (!layer || !orbs?.[index]) return;
    const rect = layer.getBoundingClientRect();
    const ox = clientX - rect.left;
    const oy = clientY - rect.top;
    const orb = orbs[index];
    const dx = orb.x - ox;
    const dy = orb.y - oy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    orb.vx += nx * CLICK_IMPULSE + rand(-0.4, 0.4);
    orb.vy += ny * CLICK_IMPULSE + rand(-0.4, 0.4);
    const s = Math.hypot(orb.vx, orb.vy);
    const cap = SPEED_MAX * 3.2;
    if (s > cap) {
      orb.vx *= cap / s;
      orb.vy *= cap / s;
    }
  }, []);

  useEffect(() => {
    const syncReduceMotion = () => {
      reduceMotionRef.current = isReduceMotionOn();
      const play = reduceMotionRef.current ? 'paused' : 'running';
      for (const el of orbRefs.current) {
        if (el) el.style.animationPlayState = play;
      }
    };
    syncReduceMotion();
    window.addEventListener('ark:prefs-changed', syncReduceMotion);
    return () => window.removeEventListener('ark:prefs-changed', syncReduceMotion);
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    let running = true;
    const backgrounded = () =>
      typeof document !== 'undefined'
      && (document.hidden || document.visibilityState === 'hidden');

    const ensureSeeded = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (w < 2 || h < 2) return false;
      if (!stateRef.current) {
        stateRef.current = seedOrbs(w, h, setup, speedMin, speedMax);
      } else {
        for (const orb of stateRef.current) {
          bounceWalls(orb, w, h);
        }
      }
      paintOrbs(stateRef.current, orbRefs.current, isReduceMotionOn());
      return true;
    };

    const tick = () => {
      if (!running) return;
      // Stop rAF while the window is hidden/blurred — continuous paint + blur
      // filters hitch the desktop compositor even when NOVA is in the background.
      if (backgrounded()) {
        rafRef.current = 0;
        return;
      }

      // Re-read every frame so blur/slider prefs never accidentally unfreeze motion.
      const frozen = isReduceMotionOn();
      reduceMotionRef.current = frozen;

      const w = layer.clientWidth;
      const h = layer.clientHeight;
      const orbs = stateRef.current;
      if (!orbs) {
        ensureSeeded();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!frozen) {
        for (const orb of orbs) {
          const s = Math.hypot(orb.vx, orb.vy);
          if (s > speedMax * 1.2) {
            orb.vx *= 0.992;
            orb.vy *= 0.992;
          }
          orb.x += orb.vx;
          orb.y += orb.vy;
          bounceWalls(orb, w, h);
        }

        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < orbs.length; i++) {
            for (let j = i + 1; j < orbs.length; j++) {
              bouncePair(orbs[i], orbs[j], speedMin, speedMax);
            }
          }
          for (const orb of orbs) {
            bounceWalls(orb, w, h);
          }
        }
      }

      paintOrbs(orbs, orbRefs.current, frozen);
      rafRef.current = requestAnimationFrame(tick);
    };

    const resume = () => {
      if (!running || backgrounded() || rafRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
    };

    ensureSeeded();
    rafRef.current = requestAnimationFrame(tick);
    const ro = new ResizeObserver(() => {
      ensureSeeded();
    });
    ro.observe(layer);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    const onBlur = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    window.addEventListener('blur', onBlur);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      ro.disconnect();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('blur', onBlur);
      // Keep seeded positions across Soft remounts from parent re-renders.
      // Only drop state when the layer truly unmounts with variant change handled by deps.
      stateRef.current = null;
    };
  }, [variant]);

  return (
    <div
      ref={layerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${isApp ? 'z-0' : ''}`}
      aria-hidden
    >
      {setup.map((spec, i) => {
        const style = {
          width: spec.size,
          height: spec.size,
          transform: 'translate3d(-9999px, -9999px, 0)',
        };
        const className = `auth-orb ${isApp ? 'auth-orb-app' : 'auth-orb-interactive'} ${spec.colorClass}`;

        if (isApp) {
          return (
            <div
              key={spec.colorClass}
              ref={el => {
                orbRefs.current[i] = el;
              }}
              className={className}
              style={style}
            />
          );
        }

        return (
          <button
            key={spec.colorClass}
            type="button"
            tabIndex={-1}
            aria-label="Bounce color light"
            ref={el => {
              orbRefs.current[i] = el;
            }}
            className={className}
            style={style}
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
              kickOrb(i, e.clientX, e.clientY);
            }}
          />
        );
      })}
    </div>
  );
}
