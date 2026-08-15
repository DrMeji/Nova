/** Expand a short user prompt into a detailed media brief for better fidelity. */

export function rewriteImagePrompt(raw: string): string {
  const prompt = String(raw || '').trim();
  if (!prompt) return 'a clean, well-composed image';

  const lower = prompt.toLowerCase();
  const subjectHints: string[] = [];

  // Keep animal/human subjects explicit so models don't swap them.
  if (/\b(cat|kitten|cats)\b/.test(lower) && !/\b(human|person|man|woman|people)\b/.test(lower)) {
    subjectHints.push('subject is a real cat (animal), not a human');
  }
  if (/\b(dog|puppy|dogs)\b/.test(lower) && !/\b(human|person|man|woman|people)\b/.test(lower)) {
    subjectHints.push('subject is a real dog (animal), not a human');
  }
  if (/\b(wallpaper|desktop background)\b/.test(lower)) {
    subjectHints.push('desktop wallpaper composition, no UI chrome, no text overlays');
  }
  if (/\bdark and simple\b|\bsimple\b/.test(lower) && /\bdark\b/.test(lower)) {
    subjectHints.push('minimal dark aesthetic, sparse composition, soft lighting');
  }
  if (/\btesla\b/.test(lower)) {
    subjectHints.push('accurate Tesla vehicle design, single coherent car body');
  }

  const fidelity = [
    'Follow the user request exactly',
    'do not invent unrelated subjects',
    'coherent anatomy and objects',
    'sharp focus, high detail, professional quality',
    'no watermarks, no UI, no captions burned into the image',
  ];

  return [prompt, ...subjectHints, ...fidelity].join(', ');
}

export function rewriteVideoPrompt(raw: string): string {
  const prompt = String(raw || '').trim();
  if (!prompt) return 'a cinematic short clip';

  const lower = prompt.toLowerCase();
  const hints: string[] = [
    'cinematic film still suitable for a short motion clip',
    'clear main subject matching the prompt',
    'dramatic lighting, shallow depth of field',
    'sharp detail, high resolution',
    'no text overlays, no watermarks',
  ];

  if (/\breel|trailer|explainer|logo\b/.test(lower)) {
    hints.push('strong focal subject centered for social video framing');
  }
  if (/\bapple\.com\b|\bapple\b/.test(lower)) {
    hints.push('modern Apple-like product aesthetic, clean minimal design');
  }

  return [prompt, ...hints].join(', ');
}

export const MEDIA_GEN_STAGES = {
  image: [
    { key: 'understand', label: 'Reading your prompt…', ms: 900 },
    { key: 'compose', label: 'Composing the scene…', ms: 1400 },
    { key: 'render', label: 'Rendering image…', ms: 0 },
  ],
  video: [
    { key: 'understand', label: 'Reading your prompt…', ms: 1000 },
    { key: 'compose', label: 'Planning the shot…', ms: 1600 },
    { key: 'render', label: 'Rendering motion…', ms: 0 },
  ],
} as const;
