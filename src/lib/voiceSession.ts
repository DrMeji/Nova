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
import {
  attachSpeakAudioMeter,
  beginSystemSpeakMeter,
  endSpeakMeter,
  punchSystemSpeakMeter,
} from '@/lib/voiceSpeakMeter';

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
export function humanizeSpeechError(code: string): string {
  const key = String(code || '').trim().toLowerCase();
  switch (key) {
    case 'network':
      return 'Speech recognition needs a network connection right now. Check Wi‑Fi, or type instead.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission denied. Allow mic access, then try again.';
    case 'audio-capture':
      return 'Could not capture audio. Check the mic in Settings → Voice.';
    case 'language-not-supported':
      return 'This speech language isn’t supported here.';
    case 'bad-grammar':
      return 'Speech recognition hit a setup error. Try the mic again.';
    case 'listen failed':
    case 'mic start failed':
      return 'Couldn’t start listening. Tap the mic and try again.';
    default:
      return code || 'Listening failed. Try the mic again, or type instead.';
  }
}

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
    if (error) opts.onError?.(humanizeSpeechError(error));
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
/** Bumped on every speak/stop so in-flight TTS promises abandon cleanly. */
let speakToken = 0;

function playBase64Audio(
  base64: string,
  mime: string,
  token: number,
  onPlaybackStart?: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (token !== speakToken) {
      resolve();
      return;
    }
    try {
      activeAudio?.pause();
      try { if (activeAudio) activeAudio.currentTime = 0; } catch { /* ignore */ }
      const audio = new Audio(`data:${mime};base64,${base64}`);
      activeAudio = audio;
      let started = false;
      const markStart = () => {
        if (started || token !== speakToken) return;
        started = true;
        onPlaybackStart?.();
      };
      const done = () => {
        if (activeAudio === audio) activeAudio = null;
        endSpeakMeter();
        resolve();
      };
      audio.onplaying = markStart;
      audio.onplay = markStart;
      audio.onended = done;
      audio.onerror = done;
      void attachSpeakAudioMeter(audio).then(() => {
        if (token !== speakToken) {
          try { audio.pause(); audio.currentTime = 0; } catch { /* ignore */ }
          done();
          return;
        }
        void audio.play().then(() => {
          if (token !== speakToken) {
            try { audio.pause(); audio.currentTime = 0; } catch { /* ignore */ }
            done();
          }
        }).catch(() => done());
      });
    } catch {
      endSpeakMeter();
      resolve();
    }
  });
}

async function speakViaNeural(text: string, token: number, onPlaybackStart?: () => void): Promise<boolean> {
  if (!window.novaDesktop?.voiceNeuralSpeak) return false;
  const voice = resolveNeuralVoiceId(getVoiceTtsVoiceUri() || undefined);
  const res = await window.novaDesktop.voiceNeuralSpeak({ text, voice });
  if (token !== speakToken) return true; // treat as handled — caller should stop
  if (!res?.ok || !res.base64) return false;
  await primeOutputSink();
  if (token !== speakToken) return true;
  await playBase64Audio(res.base64, res.mime || 'audio/mpeg', token, onPlaybackStart);
  return true;
}

async function speakViaOpenAI(text: string, token: number, onPlaybackStart?: () => void): Promise<boolean> {
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
  if (token !== speakToken) return true;
  if (!res.ok) return false;
  const data = res.data as { __binary?: boolean; base64?: string; mime?: string };
  if (!data?.__binary || !data.base64) return false;
  await primeOutputSink();
  if (token !== speakToken) return true;
  await playBase64Audio(data.base64, data.mime || 'audio/mpeg', token, onPlaybackStart);
  return true;
}

async function speakViaSystem(text: string, token: number, onPlaybackStart?: () => void): Promise<void> {
  if (token !== speakToken) return;
  const voices = await ensureSpeechVoicesLoaded();
  if (token !== speakToken) return;
  try {
    window.speechSynthesis.cancel();
  } catch { /* ignore */ }
  const utter = new SpeechSynthesisUtterance(String(text || '').slice(0, 1200));
  utter.rate = 0.96;
  utter.pitch = 1.02;
  const voice = pickBestTtsVoice(voices);
  if (voice) utter.voice = voice;
  await new Promise<void>((resolve) => {
    if (token !== speakToken) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearInterval(watch);
      resolve();
    };
    const watch = window.setInterval(() => {
      if (token !== speakToken) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        finish();
      }
    }, 120);
    utter.onstart = () => {
      if (token !== speakToken) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        finish();
        return;
      }
      beginSystemSpeakMeter();
      onPlaybackStart?.();
    };
    utter.onboundary = (ev: SpeechSynthesisEvent) => {
      if (token !== speakToken) return;
      const name = String(ev.name || '').toLowerCase();
      if (name === 'word' || name === 'sentence' || !name) {
        punchSystemSpeakMeter(name === 'sentence' ? 0.55 : 0.95);
      }
    };
    utter.onend = () => {
      endSpeakMeter();
      finish();
    };
    utter.onerror = () => {
      endSpeakMeter();
      finish();
    };
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      finish();
    }
  });
}

export type SpeakTextOptions = {
  /** Fires when audio actually starts playing — use to sync mouth animation. */
  onPlaybackStart?: () => void;
};

export function speakText(text: string, opts?: SpeakTextOptions): Promise<void> {
  const onStart = opts?.onPlaybackStart;
  const token = ++speakToken;
  return new Promise((resolve) => {
    void (async () => {
      const chunk = String(text || '').trim();
      if (!chunk) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis?.cancel();
      } catch { /* ignore */ }
      try {
        activeAudio?.pause();
        if (activeAudio) activeAudio.currentTime = 0;
      } catch { /* ignore */ }
      activeAudio = null;

      if (await speakViaNeural(chunk, token, onStart)) {
        resolve();
        return;
      }
      if (token !== speakToken) {
        resolve();
        return;
      }
      if (await speakViaOpenAI(chunk, token, onStart)) {
        resolve();
        return;
      }
      if (token !== speakToken) {
        resolve();
        return;
      }
      await speakViaSystem(chunk, token, onStart);
      resolve();
    })();
  });
}

export function stopSpeaking(): void {
  speakToken += 1;
  endSpeakMeter();
  try {
    window.speechSynthesis?.cancel();
    // Chromium sometimes ignores a single cancel while speaking.
    window.speechSynthesis?.pause?.();
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  try {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.src = '';
    }
  } catch {
    /* ignore */
  }
  activeAudio = null;
}

export async function listenOnce(
  timeoutMsOrOpts: number | { timeoutMs?: number; onMicStream?: (stream: MediaStream) => void } = 16_000,
): Promise<{ ok: boolean; text: string; error?: string }> {
  const timeoutMs = typeof timeoutMsOrOpts === 'number' ? timeoutMsOrOpts : (timeoutMsOrOpts.timeoutMs ?? 16_000);
  const onMicStream = typeof timeoutMsOrOpts === 'number' ? undefined : timeoutMsOrOpts.onMicStream;
  const rec = getRecognition();
  if (!rec) {
    return { ok: false, text: '', error: 'Speech recognition is not available in this browser.' };
  }

  // Stop any TTS so the mic isn't fighting playback / echo cancel.
  stopSpeaking();

  // Keep the selected device stream open for the whole listen — Web Speech often
  // follows the active capture device once getUserMedia has claimed it.
  const inputStream = await openVoiceInputStream();
  if (!inputStream) {
    return { ok: false, text: '', error: 'Microphone access denied. Pick a mic in Settings → Voice.' };
  }
  onMicStream?.(inputStream);

  // Brief warm-up so the OS routes capture before recognition starts.
  await new Promise<void>(r => window.setTimeout(r, 180));

  return new Promise((resolve) => {
    let done = false;
    let best = '';
    let startedAt = Date.now();
    let restartCount = 0;

    const releaseMic = () => {
      try { inputStream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    };

    const finish = (result: { ok: boolean; text: string; error?: string }) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      releaseMic();
      try { rec.onresult = null; rec.onerror = null; rec.onend = null; } catch { /* ignore */ }
      try { rec.stop(); } catch { /* ignore */ }
      try { rec.abort(); } catch { /* ignore */ }
      resolve(result);
    };

    const tryStart = () => {
      if (done) return;
      try {
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.start();
      } catch (err) {
        // Already started is fine; otherwise bail.
        const msg = err instanceof Error ? err.message : String(err || '');
        if (!/already started/i.test(msg) && restartCount === 0) {
          finish({ ok: false, text: '', error: msg || 'mic start failed' });
        }
      }
    };

    rec.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        parts.push(ev.results[i][0]?.transcript || '');
      }
      best = scrubDictationTranscript(parts.join(' ').trim());
      const last = ev.results[ev.results.length - 1] as { isFinal?: boolean };
      if (last?.isFinal && best) {
        finish({ ok: true, text: best });
      }
    };

    rec.onerror = (ev) => {
      const err = String(ev.error || 'listen failed');
      // Keep listening through silence / aborted — don't fail the turn early.
      if (err === 'no-speech' || err === 'aborted') return;
      if (err === 'audio-capture') {
        finish({ ok: false, text: '', error: 'Could not capture audio. Check the mic in Settings → Voice.' });
        return;
      }
      if (err === 'not-allowed') {
        finish({ ok: false, text: '', error: 'Microphone permission denied.' });
        return;
      }
      // Soft errors: allow onend restart path.
    };

    rec.onend = () => {
      if (done) return;
      if (best) {
        finish({ ok: true, text: best });
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed < timeoutMs - 400 && restartCount < 6) {
        restartCount += 1;
        window.setTimeout(tryStart, 120);
        return;
      }
      finish({ ok: false, text: '', error: 'no speech detected' });
    };

    const timer = window.setTimeout(() => {
      if (best) finish({ ok: true, text: best });
      else finish({ ok: false, text: '', error: 'listen timed out' });
    }, timeoutMs);

    tryStart();
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
