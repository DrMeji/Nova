import { useEffect, useRef } from 'react';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import {
  colorsForMode,
  getVoiceVizPrefs,
  VOICE_VIZ_CHANGED,
  type VoiceVizPrefs,
} from '@/lib/voiceVizPrefs';
import { getVoiceSpeakLevel } from '@/lib/voiceSpeakMeter';

/** Visual center sits above mid-screen so the ring clears the composer. */
export const VOICE_RING_CY_RATIO = 0.40;

/** @deprecated Prefer colorsForMode from voiceVizPrefs — kept for callers. */
export const VOICE_ORB_COLORS = colorsForMode('full');

type Particle = {
  x: number;
  y: number;
  baseRadius: number;
  angle: number;
  spin: number;
  orbitDir: 1 | -1;
  size: number;
  baseAlpha: number;
  alpha: number;
  phase: number;
  r: number;
  g: number;
  b: number;
  /** 0 = ring body, 1 = inner fill, 2 = float-away */
  layer: 0 | 1 | 2;
  outSpeed: number;
  life: number;
  maxLife: number;
};

type VoiceParticleRingProps = {
  energy: number;
  phase: VoiceSessionPhase;
  className?: string;
};

function isReduceMotionOn(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.reduceMotion === '1' || root.classList.contains('reduce-motion');
}

function baseParticleCount(density: number): number {
  const mul = Math.max(0.35, Math.min(1.6, density));
  if (isReduceMotionOn()) return Math.round(380 * mul);
  if (typeof window !== 'undefined' && window.devicePixelRatio > 1.5) return Math.round(900 * mul);
  return Math.round(1100 * mul);
}

function brighten(c: number) {
  return Math.min(255, Math.round(c * 1.04 + 6));
}

function pickColor(palette: Array<[number, number, number]>): [number, number, number] {
  const color = palette[Math.floor(Math.random() * palette.length)] || [56, 189, 248];
  const wobble = () => Math.round((Math.random() - 0.5) * 14);
  return [
    brighten(Math.max(0, Math.min(255, color[0] + wobble()))),
    brighten(Math.max(0, Math.min(255, color[1] + wobble()))),
    brighten(Math.max(0, Math.min(255, color[2] + wobble()))),
  ];
}

function resolveOrbitDir(
  preferred: 1 | -1,
  mode: VoiceVizPrefs['orbitMode'],
): 1 | -1 {
  if (mode === 'cw') return 1;
  if (mode === 'ccw') return -1;
  if (mode === 'none') return preferred;
  return preferred;
}

/**
 * Dense voice ring driven by VoiceVizPrefs (live settings above the composer).
 */
export function VoiceParticleRing({
  phase,
  className = '',
}: VoiceParticleRingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef(phase);
  const prefsRef = useRef<VoiceVizPrefs>(getVoiceVizPrefs());
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let dpr = 1;
    let w = 0;
    let h = 0;
    let lastColorMode = prefsRef.current.colorMode;
    let lastDensity = prefsRef.current.density;
    let lastThinkRippleAt = 0;

    const center = () => ({
      cx: w / 2,
      cy: h * VOICE_RING_CY_RATIO,
      ringR: Math.min(w, h) * 0.208,
    });

    const makeRingParticle = (
      ringR: number,
      cx: number,
      cy: number,
      i: number,
      inner: boolean,
      prefs: VoiceVizPrefs,
    ): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const palette = colorsForMode(prefs.colorMode);
      const [r, g, b] = pickColor(palette);
      const preferred: 1 | -1 = inner
        ? (Math.random() < 0.72 ? -1 : 1)
        : (Math.random() < 0.72 ? 1 : -1);
      const orbitDir = resolveOrbitDir(preferred, prefs.orbitMode);
      const spin = orbitDir * (0.00004 + Math.random() * 0.00014);
      // One continuous disc: rim band + area-uniform fill that reaches the rim (no hollow mid-gap).
      const baseRadius = inner
        ? ringR * Math.sqrt(Math.random()) * 0.9
        : ringR * (0.72 + Math.random() * 0.3);
      return {
        x: cx + Math.cos(angle) * baseRadius,
        y: cy + Math.sin(angle) * baseRadius,
        baseRadius,
        angle,
        spin,
        orbitDir,
        size: (inner ? 0.7 : 0.8) + Math.random() * (inner ? 1.85 : 2.15),
        baseAlpha: (inner ? 0.58 : 0.72) + Math.random() * 0.3,
        alpha: (inner ? 0.58 : 0.72) + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
        r,
        g,
        b,
        layer: inner ? 1 : 0,
        outSpeed: 0,
        life: 0,
        maxLife: 1,
      };
    };

    const makeEmitter = (
      ringR: number,
      cx: number,
      cy: number,
      prefs: VoiceVizPrefs,
    ): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const startR = ringR * (0.75 + Math.random() * 0.3);
      const [r, g, b] = pickColor(colorsForMode(prefs.colorMode));
      const preferred: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const strength = Math.max(0.15, prefs.floatStrength);
      return {
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        baseRadius: startR,
        angle,
        spin: 0,
        orbitDir: resolveOrbitDir(preferred, prefs.orbitMode),
        size: 0.65 + Math.random() * 1.8,
        baseAlpha: 0.88 + Math.random() * 0.1,
        alpha: 0.88 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        r,
        g,
        b,
        layer: 2,
        outSpeed: (0.06 + Math.random() * 0.1) * strength,
        life: 0,
        maxLife: (3.5 + Math.random() * 3) / Math.max(0.4, strength),
      };
    };

    const seed = (prefs: VoiceVizPrefs) => {
      const { cx, cy, ringR } = center();
      const count = baseParticleCount(prefs.density);
      const list: Particle[] = [];
      for (let i = 0; i < count; i++) {
        // ~55% fill the disc, ~45% thicken the rim — overlaps so there's no empty mid-band.
        list.push(makeRingParticle(ringR, cx, cy, i, Math.random() > 0.45, prefs));
      }
      particlesRef.current = list;
      lastColorMode = prefs.colorMode;
      lastDensity = prefs.density;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(2, Math.floor(rect.width));
      h = Math.max(2, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particlesRef.current.length === 0) seed(prefsRef.current);
    };

    const onPrefs = (ev: Event) => {
      const detail = (ev as CustomEvent<VoiceVizPrefs>).detail;
      const next = detail || getVoiceVizPrefs();
      prefsRef.current = next;
      // Rebuild when palette or density changes so colors/count update immediately.
      if (next.colorMode !== lastColorMode || Math.abs(next.density - lastDensity) > 0.04) {
        seed(next);
      } else {
        // Re-resolve orbit directions without reseeding positions.
        for (const p of particlesRef.current) {
          if (p.layer === 2) continue;
          const preferred = p.orbitDir;
          p.orbitDir = resolveOrbitDir(preferred, next.orbitMode);
        }
      }
    };
    window.addEventListener(VOICE_VIZ_CHANGED, onPrefs);

    const tick = (now: number) => {
      if (!running) return;
      const reduce = isReduceMotionOn();
      const speaking = phaseRef.current === 'speaking';
      const thinking = phaseRef.current === 'thinking';
      const prefs = prefsRef.current;
      const { cx, cy, ringR } = center();

      const speedKnob = thinking
        ? prefs.thinkSpeed
        : speaking
          ? prefs.speakSpeed
          : prefs.idleSpeed;
      const speedMul = (reduce ? 0.35 : 1) * speedKnob;
      const brightMul = prefs.brightness * (thinking ? 1.08 : speaking ? 1.05 : 1);
      // Base orbit rates — knobs scale these. Defaults are intentionally calm.
      const baseOrbit = thinking ? 0.0022 : speaking ? 0.001 : 0.0009;
      const orbitRate = reduce ? 0.0004 : baseOrbit;
      const spinBoost = thinking ? 8 : 4;
      const orbitFrozen = prefs.orbitMode === 'none';

      // Float-away only while audio is actually loud — silence between words stays still.
      const speakLevel = speaking ? getVoiceSpeakLevel() : 0;
      if (!reduce && prefs.floatAway && speaking && speakLevel > 0.08) {
        const emitChance = 0.02 * Math.max(0.2, prefs.floatStrength) * speakLevel;
        const cap = baseParticleCount(prefs.density) + Math.round(180 * prefs.floatStrength);
        if (Math.random() < emitChance && particlesRef.current.length < cap) {
          particlesRef.current.push(makeEmitter(ringR, cx, cy, prefs));
        }
      }

      // Thinking-only water-drop through the particle ring (never idle / speaking / greeting).
      let thinkWaveT = -1;
      if (thinking && !reduce && prefs.rippleStrength > 0.01) {
        const period = Math.max(400, prefs.rippleIntervalMs);
        const life = Math.max(400, prefs.rippleDurationMs);
        if (lastThinkRippleAt === 0) {
          // Arm the clock on think enter — first ripple waits a full interval.
          lastThinkRippleAt = now;
        } else {
          const elapsed = now - lastThinkRippleAt;
          if (elapsed >= period) {
            lastThinkRippleAt = now;
            thinkWaveT = 0;
          } else if (elapsed < life) {
            thinkWaveT = elapsed / life;
          }
        }
      } else {
        lastThinkRippleAt = 0;
      }

      ctx.clearRect(0, 0, w, h);

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.phase += (thinking ? 0.005 : speaking ? 0.004 : 0.0025) * speedMul * prefs.eqSpeed;

        if (p.layer === 2) {
          if (!prefs.floatAway) {
            particlesRef.current.splice(i, 1);
            continue;
          }
          p.life += 0.0045 * speedMul;
          const t = Math.min(1, p.life / p.maxLife);
          p.baseRadius += p.outSpeed * speedMul;
          if (!orbitFrozen) p.angle += orbitRate * 0.45 * p.orbitDir * speedMul;
          p.x = cx + Math.cos(p.angle) * p.baseRadius;
          p.y = cy + Math.sin(p.angle) * p.baseRadius;
          p.alpha = p.baseAlpha * Math.pow(1 - t, 0.65);
          if (t >= 1 || p.alpha < 0.06 || p.baseRadius > ringR * 3.2) {
            particlesRef.current.splice(i, 1);
            continue;
          }
          const a = Math.min(1, p.alpha * brightMul * 1.1);
          const sz = p.size;
          ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`;
          ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
          continue;
        }

        if (!reduce && !orbitFrozen) {
          p.angle += orbitRate * p.orbitDir * speedMul;
          p.angle += p.spin * spinBoost * speedMul;
        }

        let bounceR = 0;
        let bounceSz = 1;
        // Equalizer follows real TTS energy — quiet between words → no bounce.
        if (speaking && !reduce && prefs.eqStrength > 0.01 && speakLevel > 0.05) {
          const bin = Math.floor((((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 12));
          const wave =
            Math.abs(Math.sin(now * 0.014 * prefs.eqSpeed + bin * 0.7 + p.phase)) *
            (0.35 + 0.65 * speakLevel);
          bounceR = ringR * (0.01 + wave * 0.07) * prefs.eqStrength * speakLevel;
          bounceSz = 1 + wave * 0.22 * prefs.eqStrength * speakLevel;
        }

        // Water-drop: expanding wave front pushes ring pixels outward then settles.
        let rippleR = 0;
        if (thinkWaveT >= 0 && thinking) {
          const front = ringR * (0.08 + thinkWaveT * 1.35);
          const band = ringR * 0.18;
          const dist = Math.abs(p.baseRadius - front);
          if (dist < band) {
            const falloff = 1 - dist / band;
            rippleR = falloff * (1 - thinkWaveT) * ringR * 0.16 * prefs.rippleStrength;
          }
        }

        const speakBreathe = speaking ? 0.12 + speakLevel * 0.28 : thinking ? 0.34 : 0.26;
        const breatheAmp = (reduce ? 0.12 : speakBreathe) * prefs.breathe;
        const breathe = Math.sin(p.phase) * breatheAmp;
        const targetR = Math.max(0, p.baseRadius + breathe + bounceR + rippleR);
        const tx = cx + Math.cos(p.angle) * targetR;
        const ty = cy + Math.sin(p.angle) * targetR;
        const follow = speaking ? (0.08 + speakLevel * 0.18) : thinking ? 0.16 : 0.04;
        p.x += (tx - p.x) * follow;
        p.y += (ty - p.y) * follow;
        p.alpha = p.baseAlpha;

        let a = Math.min(1, p.alpha * brightMul);
        if (p.layer === 1) a *= 0.88;
        const sz = p.size * (speaking ? bounceSz : thinking ? 1.04 : 1);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${Math.max(0, Math.min(1, a))})`;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }

      raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener(VOICE_VIZ_CHANGED, onPrefs);
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full pointer-events-none ${className}`}
      aria-hidden
    />
  );
}

/** Live speak level for callers — real TTS energy when available. */
export function voicePhaseEnergy(phase: VoiceSessionPhase, t = performance.now()): number {
  if (phase === 'speaking') return getVoiceSpeakLevel();
  void t;
  return 0.12;
}
