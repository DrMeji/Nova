/** Voice visualization tunables — live-adjustable, persisted for all sessions on this PC. */

export type VoiceOrbitMode = 'both' | 'cw' | 'ccw' | 'none';
export type VoiceColorMode = 'full' | 'warm' | 'cool' | 'neon';

export type VoiceVizPrefs = {
  /** Idle orbit speed multiplier (1 = calm default). */
  idleSpeed: number;
  /** Thinking orbit speed multiplier. */
  thinkSpeed: number;
  /** Speaking orbit speed multiplier. */
  speakSpeed: number;
  /** Radial equalizer bounce strength while speaking. */
  eqStrength: number;
  /** How quickly equalizer bins pulse. */
  eqSpeed: number;
  /** Soft radius breathe on the ring. */
  breathe: number;
  /** Particle density multiplier. */
  density: number;
  /** Overall brightness. */
  brightness: number;
  /** Counter-rotate both ways, one way, or freeze orbit. */
  orbitMode: VoiceOrbitMode;
  /** Palette family. */
  colorMode: VoiceColorMode;
  /** Outward float-away pixels (off by default). */
  floatAway: boolean;
  /** How strong float-away is when enabled. */
  floatStrength: number;
  /** Thinking-only water-drop: ms between ripples. */
  rippleIntervalMs: number;
  /** Thinking-only water-drop: how long one ripple takes to cross the ring (ms). */
  rippleDurationMs: number;
  /** Thinking-only water-drop: how hard the ring is pushed. */
  rippleStrength: number;
};

export const VOICE_VIZ_DEFAULTS: VoiceVizPrefs = {
  idleSpeed: 0.3,
  thinkSpeed: 0.2,
  speakSpeed: 1,
  eqStrength: 1,
  eqSpeed: 0.5,
  breathe: 2.5,
  density: 1.6,
  brightness: 1.8,
  orbitMode: 'both',
  colorMode: 'full',
  floatAway: true,
  floatStrength: 2,
  rippleIntervalMs: 1600,
  rippleDurationMs: 1200,
  rippleStrength: 0.75,
};

/** v2 locks the tuned production defaults for everyone (old local drafts ignored). */
const STORE_KEY = 'NOVA:voice-viz-prefs-v2';
export const VOICE_VIZ_CHANGED = 'NOVA:voice-viz-changed';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

export function sanitizeVoiceVizPrefs(raw: unknown): VoiceVizPrefs {
  const d = VOICE_VIZ_DEFAULTS;
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<VoiceVizPrefs>;
  const orbitMode: VoiceOrbitMode =
    o.orbitMode === 'cw' || o.orbitMode === 'ccw' || o.orbitMode === 'none' || o.orbitMode === 'both'
      ? o.orbitMode
      : d.orbitMode;
  const colorMode: VoiceColorMode =
    o.colorMode === 'warm' || o.colorMode === 'cool' || o.colorMode === 'neon' || o.colorMode === 'full'
      ? o.colorMode
      : d.colorMode;
  return {
    idleSpeed: num(o.idleSpeed, d.idleSpeed, 0.05, 3),
    thinkSpeed: num(o.thinkSpeed, d.thinkSpeed, 0.05, 3),
    speakSpeed: num(o.speakSpeed, d.speakSpeed, 0.05, 3),
    eqStrength: num(o.eqStrength, d.eqStrength, 0, 2.5),
    eqSpeed: num(o.eqSpeed, d.eqSpeed, 0.1, 2.5),
    breathe: num(o.breathe, d.breathe, 0, 2.5),
    density: num(o.density, d.density, 0.35, 1.6),
    brightness: num(o.brightness, d.brightness, 0.4, 1.8),
    orbitMode,
    colorMode,
    floatAway: typeof o.floatAway === 'boolean' ? o.floatAway : d.floatAway,
    floatStrength: num(o.floatStrength, d.floatStrength, 0, 2),
    rippleIntervalMs: num(o.rippleIntervalMs, d.rippleIntervalMs, 400, 4000),
    rippleDurationMs: num(o.rippleDurationMs, d.rippleDurationMs, 400, 3500),
    rippleStrength: num(o.rippleStrength, d.rippleStrength, 0, 2),
  };
}

export function getVoiceVizPrefs(): VoiceVizPrefs {
  if (typeof localStorage === 'undefined') return { ...VOICE_VIZ_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...VOICE_VIZ_DEFAULTS };
    return sanitizeVoiceVizPrefs(JSON.parse(raw));
  } catch {
    return { ...VOICE_VIZ_DEFAULTS };
  }
}

export function setVoiceVizPrefs(patch: Partial<VoiceVizPrefs>): VoiceVizPrefs {
  const next = sanitizeVoiceVizPrefs({ ...getVoiceVizPrefs(), ...patch });
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VOICE_VIZ_CHANGED, { detail: next }));
  }
  return next;
}

export function resetVoiceVizPrefs(): VoiceVizPrefs {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
  const next = { ...VOICE_VIZ_DEFAULTS };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VOICE_VIZ_CHANGED, { detail: next }));
  }
  return next;
}

/** Warm / cool / neon subsets of the full RGB set. */
export function colorsForMode(mode: VoiceColorMode): Array<[number, number, number]> {
  const full: Array<[number, number, number]> = [
    [56, 189, 248],
    [167, 139, 250],
    [52, 211, 153],
    [244, 114, 182],
    [251, 191, 36],
    [34, 211, 238],
    [251, 146, 60],
    [232, 121, 249],
    [163, 230, 53],
    [96, 165, 250],
    [248, 113, 113],
    [45, 212, 191],
    [192, 132, 252],
    [250, 204, 21],
    [125, 211, 252],
    [74, 222, 128],
    [251, 113, 133],
    [129, 140, 248],
    [94, 234, 212],
    [253, 186, 116],
  ];
  if (mode === 'warm') {
    return full.filter((_, i) => [3, 4, 6, 10, 13, 16, 19].includes(i));
  }
  if (mode === 'cool') {
    return full.filter((_, i) => [0, 1, 2, 5, 8, 9, 11, 12, 14, 15, 17, 18].includes(i));
  }
  if (mode === 'neon') {
    return [
      [0, 255, 200],
      [255, 0, 180],
      [80, 220, 255],
      [255, 230, 40],
      [180, 80, 255],
      [40, 255, 120],
      [255, 90, 60],
    ];
  }
  return full;
}
