'use strict';

/** Microsoft Edge neural TTS — two ARK voices (female / male). */
const VOICES = [
  { id: 'en-US-JennyNeural', name: 'Female', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-GuyNeural', name: 'Male', locale: 'en-US', gender: 'Male' },
];

const DEFAULT_VOICE = VOICES[0].id;

async function loadEdgeTts() {
  return import('edge-tts');
}

async function listNeuralVoices() {
  return { ok: true, voices: VOICES };
}

async function synthesize(text, voice) {
  const picked = VOICES.some(v => v.id === voice) ? voice : DEFAULT_VOICE;
  try {
    const { tts } = await loadEdgeTts();
    const buf = await tts(String(text || '').slice(0, 1200), {
      voice: picked,
      rate: '+4%',
      pitch: '+0Hz',
    });
    return {
      ok: true,
      mime: 'audio/mpeg',
      base64: Buffer.from(buf).toString('base64'),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports = {
  DEFAULT_VOICE,
  listNeuralVoices,
  synthesize,
};
