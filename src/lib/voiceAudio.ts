/**
 * Voice chat audio devices — mic input + speaker/headphone output prefs.
 */

import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';

export type AudioDeviceOption = {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
};

const AUTO_VALUE = '__auto__';
export { AUTO_VALUE as VOICE_DEVICE_AUTO };

export function getVoiceInputDeviceId(): string {
  return getLocalPrefs().voiceInputDeviceId || '';
}

export function getVoiceOutputDeviceId(): string {
  return getLocalPrefs().voiceOutputDeviceId || '';
}

export function getVoiceTtsVoiceUri(): string {
  return getLocalPrefs().voiceTtsVoiceUri || '';
}

/** NOVA ships two neural voices — female default, male optional. */
export const VOICE_TTS_FEMALE_ID = 'en-US-JennyNeural';
export const VOICE_TTS_MALE_ID = 'en-US-GuyNeural';

export const VOICE_TTS_CHOICES = [
  { id: VOICE_TTS_FEMALE_ID, label: 'Female' },
  { id: VOICE_TTS_MALE_ID, label: 'Male' },
] as const;

export function resolveNeuralVoiceId(pref?: string): string {
  if (pref === VOICE_TTS_MALE_ID) return VOICE_TTS_MALE_ID;
  return VOICE_TTS_FEMALE_ID;
}

export function setVoiceAudioPrefs(patch: {
  voiceInputDeviceId?: string;
  voiceOutputDeviceId?: string;
  voiceTtsVoiceUri?: string;
  voiceInputAuto?: boolean;
  voiceOutputAuto?: boolean;
}) {
  setLocalPrefs(patch);
  window.dispatchEvent(new Event('NOVA:voice-audio-changed'));
}

function cleanDeviceLabel(label: string): string {
  return label
    .replace(/^Default\s*-\s*/i, '')
    .replace(/^Communications\s*-\s*/i, '')
    .trim();
}

/** Active mic from getUserMedia (Windows default capture device). */
export async function detectActiveMicDeviceId(): Promise<string | undefined> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return undefined;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const id = stream.getAudioTracks()[0]?.getSettings().deviceId;
    stream.getTracks().forEach(t => t.stop());
    return id || undefined;
  } catch {
    return undefined;
  }
}

/** Best-guess default speakers/headphones from enumerateDevices labels. */
export function detectDefaultOutputDeviceId(devices: AudioDeviceOption[]): string | undefined {
  const outputs = devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default');
  const pick = (re: RegExp) => outputs.find(d => re.test(d.label));
  return pick(/^Default\s*-/i)?.deviceId
    || pick(/^Communications\s*-/i)?.deviceId
    || outputs[0]?.deviceId;
}

export async function syncAutoVoiceDevices(): Promise<{
  inputId?: string;
  outputId?: string;
  inputLabel?: string;
  outputLabel?: string;
}> {
  const prefs = getLocalPrefs();
  await primeMicrophoneAccess();
  const devices = await listAudioDevices();
  const patch: Parameters<typeof setVoiceAudioPrefs>[0] = {};
  const result: {
    inputId?: string;
    outputId?: string;
    inputLabel?: string;
    outputLabel?: string;
  } = {};

  if (prefs.voiceInputAuto) {
    const inputId = await detectActiveMicDeviceId();
    if (inputId) {
      patch.voiceInputDeviceId = inputId;
      result.inputId = inputId;
      const hit = devices.find(d => d.deviceId === inputId);
      result.inputLabel = hit ? cleanDeviceLabel(hit.label) : undefined;
    }
  } else if (prefs.voiceInputDeviceId) {
    const hit = devices.find(d => d.deviceId === prefs.voiceInputDeviceId);
    result.inputId = prefs.voiceInputDeviceId;
    result.inputLabel = hit ? cleanDeviceLabel(hit.label) : undefined;
  }

  if (prefs.voiceOutputAuto) {
    const outputId = detectDefaultOutputDeviceId(devices);
    if (outputId) {
      patch.voiceOutputDeviceId = outputId;
      result.outputId = outputId;
      const hit = devices.find(d => d.deviceId === outputId);
      result.outputLabel = hit ? cleanDeviceLabel(hit.label) : undefined;
    }
  } else if (prefs.voiceOutputDeviceId) {
    const hit = devices.find(d => d.deviceId === prefs.voiceOutputDeviceId);
    result.outputId = prefs.voiceOutputDeviceId;
    result.outputLabel = hit ? cleanDeviceLabel(hit.label) : undefined;
  }

  if (Object.keys(patch).length) setVoiceAudioPrefs(patch);
  return result;
}

/** Request mic permission so enumerateDevices returns real labels. */
export async function primeMicrophoneAccess(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

export async function listAudioDevices(): Promise<AudioDeviceOption[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  const raw = await navigator.mediaDevices.enumerateDevices();
  return raw
    .filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
    .map(d => ({
      deviceId: d.deviceId,
      label: d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Speaker'),
      kind: d.kind as 'audioinput' | 'audiooutput',
    }));
}

export function listTtsVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return sortTtsVoicesNaturalFirst(
    window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en')),
  );
}

const NATURAL_VOICE_RE =
  /natural|neural|online|premium|enhanced|aria|jenny|guy|samantha|sonia|libby|ryan|emma|andrew|brian|christopher|michelle|steffan|davis|jane|jason|nancy|tony|sara|nova|alloy|echo|fable|onyx|shimmer/i;

function scoreTtsVoice(v: SpeechSynthesisVoice): number {
  let score = 0;
  const label = `${v.name} ${v.voiceURI}`;
  if (NATURAL_VOICE_RE.test(label)) score += 12;
  if (/en-us/i.test(v.lang)) score += 4;
  if (!v.localService) score += 3;
  if (/microsoft/i.test(label) && /natural|online/i.test(label)) score += 15;
  if (/google/i.test(label) && /english/i.test(label)) score += 6;
  if (/^(Microsoft David|Microsoft Zira|Microsoft Mark)/i.test(v.name) && !/natural/i.test(v.name)) {
    score -= 5;
  }
  return score;
}

export function sortTtsVoicesNaturalFirst(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => scoreTtsVoice(b) - scoreTtsVoice(a));
}

/** Wait until the OS registers speech voices (Chrome/Electron often starts empty). */
export function ensureSpeechVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve([]);
  const cached = window.speechSynthesis.getVoices();
  if (cached.length) return Promise.resolve(cached);

  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = finish;
    window.setTimeout(finish, 900);
  });
}

/** Pick English system voice when neural TTS is unavailable — honor Female/Male pref. */
export function pickBestTtsVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const wanted = getVoiceTtsVoiceUri();
  const en = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  if (wanted) {
    const exact = voices.find(v => v.voiceURI === wanted);
    if (exact) return exact;
    const wantMale = wanted === VOICE_TTS_MALE_ID;
    const gendered = en.filter(v => {
      const label = `${v.name} ${v.voiceURI}`.toLowerCase();
      if (wantMale) return /\bmale\b|david|guy|mark|ryan|james|brian|eric|steven|christopher|andrew|roger|tom/i.test(label);
      return /\bfemale\b|zira|jenny|aria|samantha|susan|hazel|linda|laura|michelle|heather|sara|emma|natasha|sonia/i.test(label);
    });
    if (gendered.length) {
      return sortTtsVoicesNaturalFirst(gendered)[0] ?? gendered[0];
    }
  }
  const ranked = sortTtsVoicesNaturalFirst(en);
  return ranked[0] ?? voices.find(v => v.lang.toLowerCase().startsWith('en')) ?? null;
}

export function recommendedTtsVoiceUri(voices: SpeechSynthesisVoice[]): string {
  return pickBestTtsVoice(voices)?.voiceURI ?? '';
}

/** Open the selected mic so STT uses that input (Web Speech follows the active capture device). */
export async function openVoiceInputStream(): Promise<MediaStream | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  const prefs = getLocalPrefs();
  if (prefs.voiceInputAuto) await syncAutoVoiceDevices();
  const deviceId = getVoiceInputDeviceId();
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  try {
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...base, deviceId: { ideal: deviceId } },
        });
      } catch {
        /* fall through — exact can fail after device re-plug */
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...base, deviceId: { exact: deviceId } },
        });
      }
    }
    return await navigator.mediaDevices.getUserMedia({ audio: base });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return null;
    }
  }
}

export type MicLevelHandle = {
  stop: () => void;
};

/**
 * Live mic level (0–1) via AnalyserNode — used by Settings → Test microphone meter.
 * Keeps the selected device stream open while monitoring.
 */
export async function startMicrophoneLevelMonitor(
  onLevel: (level: number) => void,
): Promise<{ ok: true; handle: MicLevelHandle } | { ok: false; error: string }> {
  const stream = await openVoiceInputStream();
  if (!stream) {
    return { ok: false, error: 'Could not open the microphone. Check permissions and device.' };
  }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    stream.getTracks().forEach(t => t.stop());
    return { ok: false, error: 'Web Audio not available.' };
  }
  const ctx = new Ctx();
  try {
    if (ctx.state === 'suspended') await ctx.resume();
  } catch { /* ignore */ }
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    // Sensible speech range → 0–1 meter fill.
    const level = Math.min(1, Math.pow(rms * 3.2, 0.85));
    onLevel(level);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    ok: true,
    handle: {
      stop: () => {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(raf);
        try { source.disconnect(); } catch { /* ignore */ }
        try { void ctx.close(); } catch { /* ignore */ }
        stream.getTracks().forEach(t => t.stop());
        onLevel(0);
      },
    },
  };
}

type SinkCapable = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/** Short tone through the selected headphones/speakers (output routing test). */
export async function playOutputTestTone(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'Audio not available.' };
  const prefs = getLocalPrefs();
  if (prefs.voiceOutputAuto) await syncAutoVoiceDevices();
  const outputId = getVoiceOutputDeviceId();
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return { ok: false, error: 'Web Audio not available.' };
    const ctx = new Ctx() as SinkCapable;
    if (outputId && typeof ctx.setSinkId === 'function') {
      await ctx.setSinkId(outputId);
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    osc.frequency.value = 440;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    await new Promise<void>(resolve => window.setTimeout(resolve, 280));
    osc.stop();
    await ctx.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Speaker test failed.' };
  }
}

/** Quick mic open check (legacy) — prefer startMicrophoneLevelMonitor for UI. */
export async function testMicrophoneInput(): Promise<{ ok: boolean; error?: string }> {
  const stream = await openVoiceInputStream();
  if (!stream) return { ok: false, error: 'Could not open the microphone. Check permissions and device.' };
  stream.getTracks().forEach(t => t.stop());
  return { ok: true };
}

export function formatDeviceOptionLabel(label: string): string {
  return cleanDeviceLabel(label);
}
