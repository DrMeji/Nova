import { useEffect, useRef } from 'react';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import {
  colorsForMode,
  getVoiceVizPrefs,
  VOICE_VIZ_CHANGED,
  type VoiceVizPrefs,
} from '@/lib/voiceVizPrefs';
import { getVoiceSpeakLevel } from '@/lib/voiceSpeakMeter';

/** Visual center sits above mid-screen so the sphere clears the composer. */
export const VOICE_RING_CY_RATIO = 0.4;

type VoiceDotCircleProps = {
  phase: VoiceSessionPhase;
  className?: string;
};

type Vec3 = { x: number; y: number; z: number; kind: 'surface' | 'core' };

/** Even points on a unit sphere — fibonacci / golden-angle lattice. */
function buildSurfaceDots(n: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i += 1) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = golden * i;
    out.push({
      x: Math.cos(t) * r,
      y,
      z: Math.sin(t) * r,
      kind: 'surface',
    });
  }
  return out;
}

/**
 * Continuous volume fill for thinking ripples only (not discrete shells).
 * Radii spread smoothly from core → near surface so one wave sweeps as a flow.
 */
function buildCoreDots(n: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i += 1) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const latR = Math.sqrt(Math.max(0, 1 - y * y));
    const t = golden * i;
    // Cube-root spacing → even volume density; keep under the surface shell.
    const radius = Math.cbrt((i + 0.5) / n) * 0.88;
    out.push({
      x: Math.cos(t) * latR * radius,
      y: y * radius,
      z: Math.sin(t) * latR * radius,
      kind: 'core',
    });
  }
  return out;
}

/**
 * Voice viz — white surface sphere of dots.
 * Thinking: core dots appear + one smooth screen-space ripple from center out.
 * Speak: orbit keeps moving; dots light/react to audio level only.
 */
export function VoiceDotCircle({
  phase,
  className = '',
}: VoiceDotCircleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const prefsRef = useRef<VoiceVizPrefs>(getVoiceVizPrefs());
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const surface = buildSurfaceDots(240);
    // Sparse core — only for thinking ripple (roughly ~40% of the denser fill).
    const core = buildCoreDots(48);
    let raf = 0;
    let running = true;
    let dpr = 1;
    let w = 0;
    let h = 0;
    let yaw = 0;
    let pitch = 0;
    let roll = 0;
    let lastThinkRippleAt = 0;

    const center = () => ({
      cx: w / 2,
      cy: h * VOICE_RING_CY_RATIO,
      sphereR: Math.min(w, h) * 0.22,
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(2, Math.floor(rect.width));
      h = Math.max(2, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPrefs = (ev: Event) => {
      const detail = (ev as CustomEvent<VoiceVizPrefs>).detail;
      prefsRef.current = detail || getVoiceVizPrefs();
    };
    window.addEventListener(VOICE_VIZ_CHANGED, onPrefs);

    const tick = (now: number) => {
      if (!running) return;
      const prefs = prefsRef.current;
      const speaking = phaseRef.current === 'speaking';
      const thinking = phaseRef.current === 'thinking';
      const listening = phaseRef.current === 'listening';
      const { cx, cy, sphereR } = center();
      const speakLevel = speaking ? getVoiceSpeakLevel() : 0;

      // Keep the sphere orbiting in every phase — speak only drives light reaction, not freeze.
      if (prefs.orbitMode !== 'none') {
        const speedKnob = thinking
          ? prefs.thinkSpeed
          : speaking
            ? prefs.speakSpeed
            : prefs.idleSpeed;
        const orbit = (thinking ? 0.0024 : 0.00075) * speedKnob;
        const dir = prefs.orbitMode === 'ccw' ? -1 : 1;
        yaw += orbit * dir;
        pitch += orbit * 0.42 * dir;
        roll += orbit * 0.28 * -dir;
      }

      // One continuous ripple clock — wave T eases 0→1 over duration, then waits for next.
      let thinkWaveT = -1;
      if (thinking && prefs.rippleStrength > 0.01) {
        const period = Math.max(400, prefs.rippleIntervalMs);
        const life = Math.max(400, prefs.rippleDurationMs);
        if (lastThinkRippleAt === 0) {
          // First beat starts after a short beat-in, then flows.
          lastThinkRippleAt = now;
        } else {
          const elapsed = now - lastThinkRippleAt;
          if (elapsed >= period) {
            lastThinkRippleAt = now;
            thinkWaveT = 0;
          } else if (elapsed < life) {
            // Smoothstep so the front eases, not linear stutter.
            const raw = elapsed / life;
            thinkWaveT = raw * raw * (3 - 2 * raw);
          }
        }
      } else {
        lastThinkRippleAt = 0;
      }

      const rippling = thinkWaveT >= 0;
      const r = sphereR;
      const baseDot = Math.max(1.6, Math.min(w, h) * 0.0068);
      const bright = prefs.brightness;
      const lightPulse = speaking
        ? 0.55 + 0.9 * Math.max(0.08, speakLevel) * prefs.eqStrength
        : 1;

      // Single expanding ring in screen space — whole front moves together.
      const waveFront = rippling ? thinkWaveT * sphereR * 1.28 : -1;
      const waveBand = sphereR * 0.22;
      const waveFade = rippling ? 1 - thinkWaveT * 0.75 : 0;

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);

      type Proj = {
        x: number;
        y: number;
        z: number;
        sz: number;
        a: number;
        cr: number;
        cg: number;
        cb: number;
      };
      const projected: Proj[] = [];
      const palette = colorsForMode(prefs.colorMode);

      // Core only while thinking (visible for the ripple path from center out).
      const list = thinking ? surface.concat(core) : surface;

      for (let i = 0; i < list.length; i += 1) {
        const p = list[i]!;
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosP - z1 * sinP;
        const z2 = p.y * sinP + z1 * cosP;
        const x3 = x1 * cosR - y2 * sinR;
        const y3 = x1 * sinR + y2 * cosR;

        const depth = (z2 + 1) * 0.5;
        let alpha = (0.18 + 0.72 * depth) * Math.min(1, 0.5 + 0.35 * bright);
        if (p.kind === 'core') {
          // Soft interior — only meant to carry the ripple, not densify the idle ball.
          alpha *= 0.35 + 0.45 * (1 - Math.hypot(p.x, p.y, p.z));
          if (!rippling) alpha *= 0.45;
        }
        if (thinking) alpha = Math.min(1, alpha + 0.05);
        if (listening) alpha = Math.min(1, alpha + 0.05);
        alpha = Math.min(1, alpha * lightPulse);

        let push = 0;
        if (rippling) {
          const screenDist = Math.hypot(x3, y3) * r;
          const dist = Math.abs(screenDist - waveFront);
          if (dist < waveBand) {
            const u = 1 - dist / waveBand;
            // Smooth hump across the band so the whole ring feels like one flow.
            const falloff = u * u * (3 - 2 * u);
            const hit = falloff * waveFade * prefs.rippleStrength;
            alpha = Math.min(1, alpha + hit * 0.65);
            push = hit * 0.04;
          }
        }

        if (alpha < 0.03) continue;

        const scale = 1 + push;
        const sz =
          baseDot *
          (0.55 + 0.45 * depth) *
          (p.kind === 'core' ? 0.75 : 1) *
          (push > 0 ? 1 + push * 0.7 : thinking ? 1.02 : 1);

        // Color covers more of the facing hemisphere (was a tight front core ~0.68+).
        // Back hemisphere stays white/grey; mid-front ramps into the palette.
        const frontAmt = Math.max(0, Math.min(1, (depth - 0.42) / 0.58));
        const frontEase = frontAmt * frontAmt * (3 - 2 * frontAmt);
        // Speak: color intensifies with audio; motion stays continuous above.
        const colorMix = speaking
          ? Math.min(1, frontEase * (0.85 + 0.35 * Math.max(0.12, speakLevel)))
          : frontEase;
        const pal = palette[i % palette.length] || [255, 255, 255];
        const cr = Math.round(255 + (pal[0] - 255) * colorMix);
        const cg = Math.round(255 + (pal[1] - 255) * colorMix);
        const cb = Math.round(255 + (pal[2] - 255) * colorMix);

        projected.push({
          x: cx + x3 * r * scale,
          y: cy + y3 * r * scale,
          z: z2,
          sz,
          a: alpha,
          cr,
          cg,
          cb,
        });
      }

      projected.sort((a, b) => a.z - b.z);

      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < projected.length; i += 1) {
        const d = projected[i]!;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${d.cr},${d.cg},${d.cb},${d.a})`;
        ctx.arc(d.x, d.y, d.sz / 2, 0, Math.PI * 2);
        ctx.fill();
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
