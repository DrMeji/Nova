/**
 * Live TTS output level (0–1) for the Voice ring equalizer.
 * Real analyser for HTMLAudio playback; word-boundary punches for system speechSynthesis.
 */

type MeterState = {
  level: number;
  target: number;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  source: MediaElementAudioSourceNode | null;
  data: Uint8Array | null;
  raf: number;
  active: boolean;
};

const state: MeterState = {
  level: 0,
  target: 0,
  ctx: null,
  analyser: null,
  source: null,
  data: null,
  raf: 0,
  active: false,
};

function ensureTick() {
  if (state.raf) return;
  const tick = () => {
    state.raf = 0;
    if (state.active && state.analyser && state.data) {
      state.analyser.getByteTimeDomainData(state.data);
      let sum = 0;
      for (let i = 0; i < state.data.length; i++) {
        const v = (state.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / state.data.length);
      // Speech in pauses sits near silence — aggressive gate so gaps go quiet.
      const raw = Math.min(1, Math.pow(Math.max(0, rms - 0.018) * 5.5, 0.7));
      state.target = raw < 0.04 ? 0 : raw;
    } else if (!state.active) {
      state.target *= 0.82;
      if (state.target < 0.01) state.target = 0;
    }
    // Fast attack, slower release so word onsets snap and pauses settle.
    const follow = state.target > state.level ? 0.55 : 0.18;
    state.level += (state.target - state.level) * follow;
    if (state.level < 0.008) state.level = 0;

    if (state.active || state.level > 0.01 || state.target > 0.01) {
      state.raf = requestAnimationFrame(tick);
    }
  };
  state.raf = requestAnimationFrame(tick);
}

async function ensureCtx(): Promise<AudioContext | null> {
  if (state.ctx) return state.ctx;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    if (ctx.state === 'suspended') await ctx.resume();
  } catch { /* ignore */ }
  state.ctx = ctx;
  return ctx;
}

/** Tap HTMLAudio TTS so the ring follows real waveform energy. */
export async function attachSpeakAudioMeter(audio: HTMLAudioElement): Promise<void> {
  detachSpeakAudioMeter();
  const ctx = await ensureCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
  } catch { /* ignore */ }
  try {
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    state.source = source;
    state.analyser = analyser;
    state.data = new Uint8Array(analyser.fftSize);
    state.active = true;
    state.target = 0;
    state.level = 0;
    ensureTick();
  } catch {
    /* MediaElementSource already used or Web Audio blocked — leave silent meter */
    state.active = false;
  }
}

export function detachSpeakAudioMeter(): void {
  state.active = false;
  state.target = 0;
  try { state.source?.disconnect(); } catch { /* ignore */ }
  try { state.analyser?.disconnect(); } catch { /* ignore */ }
  state.source = null;
  state.analyser = null;
  state.data = null;
  ensureTick();
}

/** System speechSynthesis has no waveform — punch on word boundaries, decay between. */
export function beginSystemSpeakMeter(): void {
  detachSpeakAudioMeter();
  state.active = true;
  state.target = 0.15;
  state.level = 0.1;
  ensureTick();
}

export function punchSystemSpeakMeter(strength = 0.9): void {
  state.active = true;
  state.target = Math.max(state.target, Math.min(1, strength));
  ensureTick();
  // Decay toward quiet so gaps between words settle.
  window.setTimeout(() => {
    if (state.active && !state.analyser) {
      state.target = Math.min(state.target, 0.08);
    }
  }, 90);
}

export function endSpeakMeter(): void {
  state.active = false;
  state.target = 0;
  detachSpeakAudioMeter();
  ensureTick();
}

/** Instant 0–1 level for the Voice ring (read every frame). */
export function getVoiceSpeakLevel(): number {
  return state.level;
}
