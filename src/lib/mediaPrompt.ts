/** Expand a short user prompt into a detailed media brief for better fidelity. */

export function rewriteImagePrompt(raw: string): string {
  const prompt = String(raw || '').trim();
  if (!prompt) return 'a clean, well-composed image';

  const lower = prompt.toLowerCase();
  const subjectHints: string[] = [];

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
  if (/\b(iphone|ipad|macbook|android phone|smartphone|galaxy|pixel|pro max|ultra)\b/.test(lower)
    || (/\b(phone|device|product)\b/.test(lower) && /\b(make|create|design|render|generate)\b/.test(lower))) {
    // Put constraints FIRST so Pollinations truncation (450 chars) keeps them.
    return [
      'isolated product hero photograph on a clean studio backdrop',
      'single smartphone device only, front three-quarter view, sharp focus',
      'no hands, no people, no fingers holding the phone, no lifestyle scene',
      prompt,
      'accurate industrial design, realistic materials, commercial product render',
      'no watermarks, no UI chrome, no captions',
    ].join(', ');
  }

  const fidelity = [
    'Follow the user request exactly',
    'match the described subject, style, and composition',
    'do not invent unrelated subjects or swap species',
    'coherent anatomy and objects',
    'sharp focus, high detail, professional quality',
    'natural lighting and believable materials',
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
    { key: 'create', label: 'Creating image', ms: 4500 },
    { key: 'sketch', label: 'Sketching it out', ms: 5500 },
    { key: 'almost', label: 'Almost done', ms: 6000 },
    { key: 'wrap', label: 'Wrapping it up', ms: 0 },
  ],
  video: [
    { key: 'create', label: 'Creating video', ms: 4500 },
    { key: 'plan', label: 'Planning the shot', ms: 5500 },
    { key: 'render', label: 'Rendering frames', ms: 7000 },
    { key: 'wrap', label: 'Wrapping it up', ms: 0 },
  ],
} as const;

export type MediaGenMode = keyof typeof MEDIA_GEN_STAGES;

/** Advance ChatGPT-style stage labels while async media work runs. */
export function runMediaGenStages(
  mode: MediaGenMode,
  onStage: (label: string) => void,
  work: () => Promise<void>,
): Promise<void> {
  const stages = MEDIA_GEN_STAGES[mode];
  let idx = 0;
  onStage(stages[0].label);
  let timer: number | undefined;
  const arm = () => {
    const wait = stages[idx].ms;
    if (!wait || idx >= stages.length - 1) return;
    timer = window.setTimeout(() => {
      idx = Math.min(idx + 1, stages.length - 1);
      onStage(stages[idx].label);
      arm();
    }, wait);
  };
  arm();
  return work().finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}
