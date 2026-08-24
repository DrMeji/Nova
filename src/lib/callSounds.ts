/** Outgoing / incoming call ring tones (Web Audio — no asset files). */

let audioCtx: AudioContext | null = null;
let ringTimer: number | null = null;

function ctx() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

function beep(freq: number, ms: number, gain = 0.08) {
  try {
    const ac = ctx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ac.destination);
    const t = ac.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  } catch {
    /* ignore — autoplay may block until user gesture (call button satisfies this) */
  }
}

function ringPulse() {
  beep(440, 180, 0.07);
  window.setTimeout(() => beep(520, 180, 0.06), 220);
}

/** Loop a short two-tone ring while `outgoing` or `incoming`. */
export function startCallRingtone() {
  stopCallRingtone();
  ringPulse();
  ringTimer = window.setInterval(ringPulse, 2800);
}

export function stopCallRingtone() {
  if (ringTimer != null) {
    window.clearInterval(ringTimer);
    ringTimer = null;
  }
}

/** Short connect chirp when a call goes live. */
export function playCallConnected() {
  stopCallRingtone();
  beep(660, 90, 0.06);
  window.setTimeout(() => beep(880, 120, 0.05), 100);
}

export function playCallEnded() {
  stopCallRingtone();
  beep(320, 140, 0.05);
}
