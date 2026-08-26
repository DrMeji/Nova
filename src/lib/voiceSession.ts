/**
 * Browser Web Speech voice loop — conversation only (no disk / agent tools).
 */

import { voiceConversationSystemPrompt } from '@/lib/voiceMode';

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

export function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text || '').slice(0, 1200));
    utter.rate = 1;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export async function listenOnce(timeoutMs = 12_000): Promise<{ ok: boolean; text: string; error?: string }> {
  const rec = getRecognition();
  if (!rec) {
    return { ok: false, text: '', error: 'Speech recognition is not available in this browser.' };
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = (result: { ok: boolean; text: string; error?: string }) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try { rec.stop(); } catch { /* ignore */ }
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
  return [
    voiceConversationSystemPrompt(),
    '',
    `User (spoken): ${userText}`,
  ].join('\n');
}
