/** Expand a short user prompt into a detailed media brief for better fidelity. */

const PRODUCT_RE =
  /\b(iphone|ipad|macbook|android phone|smartphone|galaxy|pixel|pro max|ultra)\b/;
const PRODUCT_ACTION_RE =
  /\b(phone|device|product)\b.*\b(make|create|design|render|generate)\b|\b(make|create|design|render|generate)\b.*\b(phone|device|product)\b/;

export function isProductPrompt(raw: string): boolean {
  const lower = String(raw || '').toLowerCase();
  return PRODUCT_RE.test(lower) || PRODUCT_ACTION_RE.test(lower);
}

export const PRODUCT_NEGATIVE =
  'hands, hand, fingers, person, people, face, arm, holding, lifestyle, selfie, grip, palm';

function productPackshotPrompt(subject: string): string {
  const concept = subject
    .replace(/product concept:\s*/i, '')
    .replace(/\biphone\s*(1[8-9]|[2-9]\d)[^\s,]*/gi, 'next-generation titanium flagship smartphone')
    .slice(0, 140);
  return [
    `studio photograph of ${concept}`,
    'isolated product on a seamless gray backdrop',
    'centered, no hands, no people, no lifestyle scene',
  ].join(', ');
}

function hostSafeImagePrompt(raw: string): string {
  let t = String(raw || '').trim();
  if (/\biphone\s*(1[8-9]|[2-9]\d)\b/i.test(t)) {
    t = t.replace(/\biphone\s*(1[8-9]|[2-9]\d)[^\s,]*/gi, 'next-generation titanium flagship smartphone');
  }
  t = t.replace(/\bplad\b/gi, 'plaid');
  return t;
}

export function rewriteImagePrompt(raw: string): string {
  // Keep the user’s subject; only add fidelity hints — never swap in a different scene.
  const prompt = hostSafeImagePrompt(String(raw || '').trim());
  if (!prompt) return 'a clean, well-composed image';

  if (/studio photograph of |isolated product on a seamless/i.test(prompt)) {
    return prompt;
  }

  const lower = prompt.toLowerCase();
  const subjectHints: string[] = [];

  if (/\b(wireless|bluetooth)\b/.test(lower) && /\b(mouse|keyboard|headset|earbuds|headphones)\b/.test(lower)) {
    subjectHints.push('wireless device with no cable, no cord, no wire visible');
  }
  if (/\b(logitech|razer|steelseries|corsair)\b/.test(lower)) {
    subjectHints.push('accurate consumer electronics product design, no garbled logos or fake brand text');
  }
  if (/\b(cat|kitten|cats)\b/.test(lower) && !/\b(human|person|man|woman|people)\b/.test(lower)) {
    subjectHints.push('subject is a real cat (animal), full face and body in focus, whiskers visible, not a human');
  }
  if (/\b(dog|puppy|dogs)\b/.test(lower) && !/\b(human|person|man|woman|people)\b/.test(lower)) {
    subjectHints.push('subject is a real dog (animal), full body in focus, not a human');
  }
  if (/\b(wallpaper|desktop background|lock screen)\b/.test(lower)) {
    subjectHints.push('16:9 landscape desktop wallpaper, edge-to-edge composition, no desktop icons, no taskbar, no UI chrome, no text overlays');
  }
  if (/\b4k\b|\b3840\b|\b2160\b|\b1920\s*x\s*1080\b|\brecreate\b|\bimprove this\b|\bupscale\b/.test(lower)) {
    subjectHints.push('ultra sharp 4K detail, crisp edges, high resolution');
  }
  if (/\bdark and simple\b|\bsimple\b/.test(lower) && /\bdark\b/.test(lower)) {
    subjectHints.push('minimal dark aesthetic, sparse composition, soft lighting');
  }
  if (/\b(tesla|model\s*s|plaid|cybertruck|model\s*[3xy])\b/.test(lower)) {
    subjectHints.push('accurate modern Tesla EV design, single coherent car body, correct proportions');
    if (/\bplaid\b|\bmodel\s*s\b/.test(lower)) {
      subjectHints.push('2021+ Tesla Model S Plaid refreshed fascia, full-width headlight bar — not the early 2012-2016 Model S');
    }
    if (/\bred\b|\bcrimson\b|\bscarlet\b/.test(lower)) {
      subjectHints.push('vivid red factory paint, studio automotive lighting, sharp reflections');
    }
  }
  if (isProductPrompt(prompt)) {
    return productPackshotPrompt(prompt);
  }

  const fidelity = [
    'Follow the user request exactly',
    'match the described subject, style, and composition',
    'do not invent unrelated subjects or swap species',
    'coherent anatomy and objects, correct proportions',
    'tack-sharp focus across the entire subject, deep depth of field',
    'no soft bokeh blur on the main subject, no shallow DOF, no out-of-focus face',
    'crisp 1080p-or-better detail, high resolution',
    'natural lighting and believable materials',
    'no watermarks, no UI, no captions burned into the image',
    'no misspelled brand text or nonsense lettering on products',
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
  if (isProductPrompt(prompt)) {
    hints.unshift(
      'product-focused motion, isolated device on a seamless backdrop, no hands, no people',
    );
  }

  return [prompt, ...hints].join(', ');
}

/** Target pixel size from prompt intent — default ~1080p-class square. */
export function resolveImageDimensions(raw: string): { width: number; height: number } {
  const lower = String(raw || '').toLowerCase();
  if (/\b(portrait|vertical|9:16|phone wallpaper|lock screen)\b/.test(lower)) {
    return { width: 768, height: 1344 };
  }
  if (/\b(wallpaper|desktop background|desktop image|16:9|1920|1080|landscape|banner)\b/.test(lower)
    || (/\b(recreate|improve|upscale|4k|8k)\b/.test(lower) && /\b(wallpaper|desktop|landscape|16:9)\b/.test(lower))) {
    return { width: 1344, height: 768 };
  }
  return { width: 1280, height: 1280 };
}

export const MEDIA_GEN_STAGES = {
  image: [
    { key: 'create', label: 'Creating image', ms: 14000 },
    { key: 'sketch', label: 'Refining details', ms: 22000 },
    { key: 'almost', label: 'Polishing sharpness', ms: 28000 },
    { key: 'wrap', label: 'Wrapping it up', ms: 0 },
  ],
  video: [
    { key: 'create', label: 'Creating video', ms: 5500 },
    { key: 'plan', label: 'Planning the shot', ms: 7000 },
    { key: 'render', label: 'Rendering frames', ms: 9000 },
    { key: 'wrap', label: 'Wrapping it up', ms: 0 },
  ],
} as const;

export type MediaGenMode = keyof typeof MEDIA_GEN_STAGES;

/** Advance ChatGPT-style stage labels while async media work runs (last stage holds until work ends). */
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
