/**
 * Browser Web Speech voice loop — conversation only (no disk / agent tools).
 */

import { desktopRequest } from '@/lib/httpDesktop';
import { getProviderApiKeys } from '@/lib/localPrefs';
import {
  ensureSpeechVoicesLoaded,
  getVoiceOutputDeviceId,
  getVoiceTtsVoiceUri,
  openVoiceInputStream,
  pickBestTtsVoice,
  resolveNeuralVoiceId,
} from '@/lib/voiceAudio';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function voiceSupported(): boolean {
  return Boolean(getRecognition()) && typeof window !== 'undefined' && 'speechSynthesis' in window;
}

type SinkCapable = AudioContext & { setSinkId?: (id: string) => Promise<void> };

async function primeOutputSink(): Promise<void> {
  const outputId = getVoiceOutputDeviceId();
  if (!outputId || typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx() as SinkCapable;
    if (typeof ctx.setSinkId === 'function') {
      await ctx.setSinkId(outputId);
      await ctx.close();
    }
  } catch {
    /* output routing optional */
  }
}

let activeAudio: HTMLAudioElement | null = null;

function playBase64Audio(
  base64: string,
  mime: string,
  onPlaybackStart?: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    try {
      activeAudio?.pause();
      const audio = new Audio(`data:${mime};base64,${base64}`);
      activeAudio = audio;
      let started = false;
      const markStart = () => {
        if (started) return;
        started = true;
        onPlaybackStart?.();
      };
      audio.onplaying = markStart;
      audio.onplay = markStart;
      audio.onended = () => {
        if (activeAudio === audio) activeAudio = null;
        resolve();
      };
      audio.onerror = () => {
        if (activeAudio === audio) activeAudio = null;
        resolve();
      };
      void audio.play().catch(() => resolve());
    } catch {
      resolve();
    }
  });
}

async function speakViaNeural(text: string, onPlaybackStart?: () => void): Promise<boolean> {
  if (!window.arkDesktop?.voiceNeuralSpeak) return false;
  const voice = resolveNeuralVoiceId(getVoiceTtsVoiceUri() || undefined);
  const res = await window.arkDesktop.voiceNeuralSpeak({ text, voice });
  if (!res?.ok || !res.base64) return false;
  await primeOutputSink();
  await playBase64Audio(res.base64, res.mime || 'audio/mpeg', onPlaybackStart);
  return true;
}

async function speakViaOpenAI(text: string, onPlaybackStart?: () => void): Promise<boolean> {
  const key = getProviderApiKeys().openai;
  if (!key?.trim() || !window.arkDesktop?.httpRequest) return false;
  const res = await desktopRequest('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    authProviderId: 'openai',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'nova',
      input: String(text || '').slice(0, 4096),
      response_format: 'mp3',
    }),
  });
  if (!res.ok) return false;
  const data = res.data as { __binary?: boolean; base64?: string; mime?: string };
  if (!data?.__binary || !data.base64) return false;
  await primeOutputSink();
  await playBase64Audio(data.base64, data.mime || 'audio/mpeg', onPlaybackStart);
  return true;
}

async function speakViaSystem(text: string, onPlaybackStart?: () => void): Promise<void> {
  const voices = await ensureSpeechVoicesLoaded();
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(String(text || '').slice(0, 1200));
  utter.rate = 0.96;
  utter.pitch = 1.02;
  const voice = pickBestTtsVoice(voices);
  if (voice) utter.voice = voice;
  await new Promise<void>((resolve) => {
    utter.onstart = () => onPlaybackStart?.();
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export type SpeakTextOptions = {
  /** Fires when audio actually starts playing — use to sync mouth animation. */
  onPlaybackStart?: () => void;
};

export function speakText(text: string, opts?: SpeakTextOptions): Promise<void> {
  const onStart = opts?.onPlaybackStart;
  return new Promise((resolve) => {
    void (async () => {
      const chunk = String(text || '').trim();
      if (!chunk) {
        resolve();
        return;
      }
      window.speechSynthesis?.cancel();
      activeAudio?.pause();
      activeAudio = null;

      if (await speakViaNeural(chunk, onStart)) {
        resolve();
        return;
      }
      if (await speakViaOpenAI(chunk, onStart)) {
        resolve();
        return;
      }
      await speakViaSystem(chunk, onStart);
      resolve();
    })();
  });
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
    activeAudio?.pause();
    activeAudio = null;
  } catch {
    /* ignore */
  }
}

export async function listenOnce(
  timeoutMsOrOpts: number | { timeoutMs?: number; onMicStream?: (stream: MediaStream) => void } = 12_000,
): Promise<{ ok: boolean; text: string; error?: string }> {
  const timeoutMs = typeof timeoutMsOrOpts === 'number' ? timeoutMsOrOpts : (timeoutMsOrOpts.timeoutMs ?? 12_000);
  const onMicStream = typeof timeoutMsOrOpts === 'number' ? undefined : timeoutMsOrOpts.onMicStream;
  const rec = getRecognition();
  if (!rec) {
    return { ok: false, text: '', error: 'Speech recognition is not available in this browser.' };
  }

  const inputStream = await openVoiceInputStream();
  if (!inputStream) {
    return { ok: false, text: '', error: 'Microphone access denied. Pick a mic in Settings → Voice.' };
  }
  onMicStream?.(inputStream);
  return new Promise((resolve) => {
    let done = false;
    const releaseMic = () => {
      inputStream.getTracks().forEach(t => t.stop());
    };
    const finish = (result: { ok: boolean; text: string; error?: string }) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      releaseMic();
      try { rec.stop(); } catch { /* ignore */ }
      try { rec.abort(); } catch { /* ignore */ }
      resolve(result);
    };

    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        parts.push(ev.results[i][0]?.transcript || '');
      }
      finish({ ok: true, text: parts.join(' ').trim() });
    };
    rec.onerror = (ev) => finish({ ok: false, text: '', error: ev.error || 'listen failed' });
    rec.onend = () => {
      if (!done) finish({ ok: false, text: '', error: 'no speech detected' });
    };

    const timer = window.setTimeout(() => finish({ ok: false, text: '', error: 'listen timed out' }), timeoutMs);
    try {
      rec.start();
    } catch (err) {
      finish({ ok: false, text: '', error: err instanceof Error ? err.message : 'mic start failed' });
    }
  });
}

export function voiceBrainPrompt(userText: string): string {
  // User text only — system identity is applied separately so models do not speak their rules aloud.
  return String(userText || '').trim();
}

/** Soft strip if a model still echoes capability / constraint boilerplate. */
export function scrubVoiceConstraintEcho(reply: string): string {
  let t = String(reply || '').trim();
  if (!t) return t;
  const lines = t.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const filtered = lines.filter(l => {
    if (/^you (?:are|cannot|can'?t|will not|won'?t)\b/i.test(l) && /\b(?:pc|build|install|file|weapon|violent|coding|program)\b/i.test(l)) {
      return false;
    }
    if (/\bi (?:cannot|can'?t|will not|won'?t)\b[\s\S]{0,80}\b(?:control (?:this )?pc|install software|create or edit|build apps?|make (?:a )?code|give you anything violent)\b/i.test(l)) {
      return false;
    }
    if (/\buse text chat or code instead\b/i.test(l)) return false;
    if (/\bspoken conversation partner\b/i.test(l)) return false;
    return true;
  });
  t = (filtered.length ? filtered : lines).join(' ').replace(/\s+/g, ' ').trim();
  return t;
}
