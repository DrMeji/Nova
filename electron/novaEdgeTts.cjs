'use strict';

const { Communicate } = require('edge-tts-universal');

/** Microsoft Edge neural TTS — two NOVA voices (female / male). */
const VOICES = [
  { id: 'en-US-JennyNeural', name: 'Female', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-GuyNeural', name: 'Male', locale: 'en-US', gender: 'Male' },
];

const DEFAULT_VOICE = VOICES[0].id;

async function listNeuralVoices() {
  return { ok: true, voices: VOICES };
}

async function synthesize(text, voice) {
  const picked = VOICES.some(v => v.id === voice) ? voice : DEFAULT_VOICE;
  const chunk = String(text || '').slice(0, 1200).trim();
  if (!chunk) {
    return { ok: false, error: 'Empty text' };
  }
  try {
    const comm = new Communicate(chunk, picked, {
      rate: '+4%',
      pitch: '+0Hz',
    });
    const parts = [];
    for await (const msg of comm.stream()) {
      if (msg.type === 'audio' && msg.data) {
        parts.push(Buffer.from(msg.data));
      }
    }
    const buf = Buffer.concat(parts);
    if (!buf.length) {
      return { ok: false, error: 'No audio received from neural TTS' };
    }
    return {
      ok: true,
      mime: 'audio/mpeg',
      base64: buf.toString('base64'),
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
