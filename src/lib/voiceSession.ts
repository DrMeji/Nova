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

/** Mic → text only (Chat composer). Does not require TTS. */
export function speechRecognitionSupported(): boolean {
  return Boolean(getRecognition());
}

export type LiveDictationHandle = {
  stop: () => void;
};

type RecognitionResultList = {
  length: number;
  [i: number]: { isFinal?: boolean; [j: number]: { transcript: string } };
};

/**
 * Fix common Web Speech mishears in gaming / streamer chat.
 * Speech engines often hear "Timmy" as "teammate".
 */
export function scrubDictationTranscript(text: string): string {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;

  // ItsTimmy / Timmy (Apex streamer) — highest-frequency miss.
  t = t.replace(/\b(?:it'?s|its|his|is)\s+teammates?\b/gi, "it's Timmy");
  t = t.replace(/\bteammates?\b/gi, (m, offset, full) => {
    const before = String(full).slice(Math.max(0, offset - 24), offset);
    // Only rewrite bare "teammate" when the utterance already smells like a name ask / Apex.
    if (/\b(?:how\s+much|earned|earning|apex|streamer|twitch|who\s+is|about)\b/i.test(before)
      || /\b(?:how\s+much|earned|apex|twitch|streamer)\b/i.test(String(full))) {
      return 'Timmy';
    }
    return m;
  });
  t = t.replace(/\bits\s*timmy\b/gi, 'ItsTimmy');
  t = t.replace(/\bit'?s\s+timmy\b/gi, "it's Timmy");

  // Game titles
  t = t.replace(/\bapex\s+legend\b/gi, 'Apex Legends');
  t = t.replace(/\bapex\s+legends?\b/gi, 'Apex Legends');
  t = t.replace(/\bvalorant\b/gi, 'Valorant');
  t = t.replace(/\bleague\s+of\s+legend\b/gi, 'League of Legends');
  t = t.replace(/\bcounter[- ]?strike\s*2\b/gi, 'CS2');

  // Light cleanup
  t = t.replace(/\bcan\s+you\s+give\s+me\s+information\s+on\s+more\s+on\b/gi, 'can you give me more information on');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Live speech-to-text for the Chat composer.
 * Click mic again (handle.stop) when done speaking.
 */
export function startLiveDictation(opts: {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}): LiveDictationHandle {
  const rec = getRecognition();
  if (!rec) {
    queueMicrotask(() => {
      opts.onError?.('Speech recognition is not available here.');
      opts.onEnd?.();
    });
    return { stop: () => undefined };
  }

  let closed = false;
  let finalText = '';
  let interimText = '';
  let inputStream: MediaStream | null = null;

  const releaseMic = () => {
    try { inputStream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    inputStream = null;
  };

  const close = (error?: string) => {
    if (closed) return;
    closed = true;
    releaseMic();
    try { rec.stop(); } catch { /* ignore */ }
    try { rec.abort(); } catch { /* ignore */ }
    const text = scrubDictationTranscript((finalText || interimText).trim());
    if (error) opts.onError?.(error);
    else if (text) opts.onFinal?.(text);
    opts.onEnd?.();
  };

  const stop = () => close();

  void (async () => {
    inputStream = await openVoiceInputStream();
    if (!inputStream) {
      close('Microphone access denied. Check Windows privacy settings or Settings → Voice.');
      return;
    }
    if (closed) {
      releaseMic();
      return;
    }

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = opts.lang || 'en-US';
    rec.onresult = (ev) => {
      const results = ev.results as RecognitionResultList;
      let rebuiltFinal = '';
      let interim = '';
      for (let i = 0; i < results.length; i++) {
        const piece = results[i][0]?.transcript || '';
        if (results[i].isFinal) rebuiltFinal += `${piece} `;
        else interim += piece;
      }
      finalText = scrubDictationTranscript(rebuiltFinal.replace(/\s+/g, ' ').trim());
      interimText = scrubDictationTranscript(interim);
      const live = scrubDictationTranscript(`${finalText} ${interim}`.replace(/\s+/g, ' ').trim());
      if (live) opts.onInterim?.(live);
    };
    rec.onerror = (ev) => {
      const err = String(ev.error || 'listen failed');
      if (err === 'aborted' || err === 'no-speech') {
        close();
        return;
      }
      close(err);
    };
    rec.onend = () => {
      // Engine often ends after a pause — treat as done.
      close();
    };

    try {
      rec.start();
    } catch (err) {
      close(err instanceof Error ? err.message : 'mic start failed');
    }
  })();

  return { stop };
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
  if (!window.novaDesktop?.voiceNeuralSpeak) return false;
  const voice = resolveNeuralVoiceId(getVoiceTtsVoiceUri() || undefined);
  const res = await window.novaDesktop.voiceNeuralSpeak({ text, voice });
  if (!res?.ok || !res.base64) return false;
  await primeOutputSink();
  await playBase64Audio(res.base64, res.mime || 'audio/mpeg', onPlaybackStart);
  return true;
}

async function speakViaOpenAI(text: string, onPlaybackStart?: () => void): Promise<boolean> {
  const key = getProviderApiKeys().openai;
  if (!key?.trim() || !window.novaDesktop?.httpRequest) return false;
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
