/**
 * Hero / product imagery for marketing-site creates.
 * Every project gets a unique generative prompt — no canned stock photos,
 * no shared cafe Unsplash fallbacks, no placeholder hosts.
 */

import { getEngineStatus } from '@/lib/arkEngine';
import { hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';

export type PollinationsImageOpts = {
  width?: number;
  height?: number;
  model?: string;
  /** Stable per-project seed so two cafes never share the same hero. */
  seed?: number | string;
};

/** Local image engines we recommend for fresh site heroes (multi-model path). */
export const RECOMMENDED_SITE_IMAGE_MODELS = [
  { id: 'sd15-local', name: 'Stable Diffusion 1.5 (Local)', where: 'Models → Local AI / Image' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo (Local)', where: 'Models → Local AI / Image' },
  { id: 'flux-schnell-local', name: 'FLUX.1 Schnell (Local)', where: 'Models → Local AI / Image' },
] as const;

export const RECOMMENDED_SITE_IMAGE_MODEL_ID = RECOMMENDED_SITE_IMAGE_MODELS[0].id;
export const RECOMMENDED_SITE_IMAGE_MODEL_NAME = RECOMMENDED_SITE_IMAGE_MODELS[0].name;

/** Known canned Unsplash photo IDs we used to hard-wire (must never reappear). */
const BANNED_UNSPLASH_IDS = [
  '1554118811-1e0d58224f24', // old cafe counter / BROEI look
  '1517248135467-4c7edcad34c4', // restaurant
  '1523275335684-37898b6baf30', // product watch
  '1497366216548-37526070297c', // generic office
  '1501780391173', // mountain / lineup residue
  '1414235077428', // restaurant residue
];

/** Turn slug-y model prompts into real photography language. */
export function enrichImagePrompt(prompt: string): string {
  let p = String(prompt || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!p) p = 'premium commercial photography';
  // Thin prompts like "cozy cafe hero image" → add camera / lighting cues (still unique — never swap to stock).
  if (p.length < 48 || (/^(?:cozy|warm|nice|beautiful|cool)\b/i.test(p) && p.split(' ').length < 8)) {
    p = `${p}, professional photography, sharp focus, natural lighting, high detail, 35mm, editorial quality`;
  }
  if (!/\b(?:photo|photograph|photography|cinematic|studio|lens|dslr|35mm|editorial)\b/i.test(p)) {
    p = `${p}, professional photograph, sharp detail`;
  }
  return p.slice(0, 320);
}

/** Deterministic seed from project name (+ optional salt) so each brand gets a different image. */
export function heroSeedForProject(projectName: string, salt = ''): number {
  const s = `${String(projectName || 'nova')}|${String(salt || '')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000_000 || 1;
}

export function pollinationsImageUrl(prompt: string, opts?: PollinationsImageOpts): string {
  const w = Math.max(1280, opts?.width ?? 1920);
  const h = Math.max(720, opts?.height ?? 1080);
  const model = opts?.model || 'flux';
  const q = encodeURIComponent(enrichImagePrompt(prompt));
  const seed = opts?.seed != null ? String(opts.seed) : String(Date.now() % 1_000_000_000);
  return `https://image.pollinations.ai/prompt/${q}?width=${w}&height=${h}&model=${model}&nologo=true&enhance=true&seed=${encodeURIComponent(seed)}`;
}

/**
 * Unique hero URL for this project + scene. Never returns a fixed stock photo.
 */
export function uniqueHeroImageUrl(
  scenePrompt: string,
  projectName: string,
  opts?: Omit<PollinationsImageOpts, 'seed'> & { salt?: string },
): string {
  const brand = String(projectName || 'brand').trim() || 'brand';
  const scene = enrichImagePrompt(scenePrompt);
  const prompt = `${brand} branded scene: ${scene}, unique original photograph, not a stock template`;
  return pollinationsImageUrl(prompt, {
    width: opts?.width,
    height: opts?.height,
    model: opts?.model,
    seed: heroSeedForProject(brand, opts?.salt || scene.slice(0, 48)),
  });
}

/** @deprecated Kept only so old imports compile — always unique generative, never canned Unsplash. */
export function unsplashHeroUrl(kind: 'cafe' | 'restaurant' | 'product' | 'generic' = 'generic'): string {
  const scenes: Record<typeof kind, string> = {
    cafe: 'warm specialty coffee shop interior, wooden counter, soft morning light, editorial',
    restaurant: 'fine dining restaurant dining room, candlelight, linen tables, editorial',
    product: 'premium product hero on soft studio backdrop, commercial photography',
    generic: 'modern architectural interior with soft daylight, editorial photography',
  };
  return uniqueHeroImageUrl(scenes[kind], `nova-${kind}`, { salt: kind });
}

/** Apple.com-style product hero prompts (private lookalike tests) — unique seeds per device. */
export function appleStyleHeroImageUrls(projectName = 'apple.com'): Record<string, string> {
  return {
    iphone: uniqueHeroImageUrl(
      'premium smartphone product hero on soft gradient studio backdrop, minimal commercial photography, centered device, high end, sharp focus',
      projectName,
      { width: 1920, height: 1280, salt: 'iphone' },
    ),
    macbook: uniqueHeroImageUrl(
      'premium laptop product hero open on desk, soft daylight, minimal commercial photography, centered, sharp detail',
      projectName,
      { width: 1920, height: 1280, salt: 'macbook' },
    ),
    watch: uniqueHeroImageUrl(
      'premium smartwatch product hero close up, soft gradient studio, minimal commercial photography, macro sharp',
      projectName,
      { width: 1600, height: 1200, salt: 'watch' },
    ),
    airpods: uniqueHeroImageUrl(
      'premium wireless earbuds product hero with charging case, soft studio lighting, minimal commercial photography, sharp',
      projectName,
      { width: 1600, height: 1200, salt: 'airpods' },
    ),
  };
}

export function briefWantsSiteHeroImagery(brief: string, projectName = ''): boolean {
  const t = `${brief}\n${projectName}`;
  return /\b(?:hero|landing|website|site|cafe|coffee|restaurant|bistro|bakery|marketing|unsplash|background\s*image|full[- ]?bleed)\b/i.test(t);
}

export async function listReadyLocalImageModels(): Promise<Array<{ id: string; name: string }>> {
  try {
    if (!window.arkDesktop?.engineStatus) return [];
    const status = await getEngineStatus();
    if (status.phase !== 'online' && status.phase !== 'degraded') return [];
    const want = new Set<string>(RECOMMENDED_SITE_IMAGE_MODELS.map((m) => m.id));
    return (status.models || [])
      .filter((m) => m.status === 'ready' && want.has(String(m.id)))
      .map((m) => {
        const meta = RECOMMENDED_SITE_IMAGE_MODELS.find((x) => x.id === m.id);
        return { id: String(m.id), name: meta?.name || String(m.name || m.id) };
      });
  } catch {
    return [];
  }
}

export function hasCloudImageKey(): boolean {
  return (
    (hasProviderApiKey('huggingface') && isCloudProviderEnabled('huggingface'))
    || (hasProviderApiKey('openai') && isCloudProviderEnabled('openai'))
    || (hasProviderApiKey('fireworks') && isCloudProviderEnabled('fireworks'))
  );
}

export async function isLocalSiteImageReady(): Promise<boolean> {
  const ready = await listReadyLocalImageModels();
  return ready.length > 0;
}

/**
 * Honest chat ask when marketing heroes need image models the user has not installed.
 * Does not block the build — generative URLs can still draft — but never silent stock reuse.
 */
export function siteImageCapabilityGapReply(opts?: {
  projectName?: string;
  readyLocal?: Array<{ id: string; name: string }>;
  hasCloudKey?: boolean;
}): string | null {
  if (opts?.readyLocal?.length) return null;
  const name = String(opts?.projectName || 'this site').trim() || 'this site';
  const lines = [
    `For **${name}**, I need a fresh original hero photo — not a reused stock cafe background.`,
    '',
    '**Download an image model so multi-model can generate a unique background:**',
    ...RECOMMENDED_SITE_IMAGE_MODELS.map(
      (m) => `- **${m.name}** → ${m.where} (start with **${RECOMMENDED_SITE_IMAGE_MODEL_NAME}** if unsure)`,
    ),
  ];
  if (!opts?.hasCloudKey) {
    lines.push(
      '',
      '**Or** Models → Cloud → add a Hugging Face / OpenAI image key for a cloud image hop.',
    );
  } else {
    lines.push('', 'A cloud image key is already saved — I can hop to that after local weights are optional.');
  }
  lines.push(
    '',
    'After the model is ready, say **regenerate the hero background** and I will rebuild imagery unique to this brand.',
  );
  return lines.join('\n');
}

export function siteImageGuidanceForBrief(brief: string, projectName: string): string {
  const t = `${brief}\n${projectName}`;
  const brand = String(projectName || 'this brand').trim() || 'this brand';
  const seed = heroSeedForProject(brand, brief.slice(0, 64));
  const lines = [
    'IMAGES (required for marketing / replica sites):',
    '- NEVER use via.placeholder.com, placehold.co, lorem pics, or broken local files unless you also emit the binary.',
    '- NEVER paste a fixed Unsplash photo id or any shared stock URL. Every project must look different.',
    '- NEVER reuse a previous cafe/restaurant hero. Build a UNIQUE photography prompt that includes this brand name.',
    `- Prefer Pollinations Flux with an explicit seed for uniqueness: https://image.pollinations.ai/prompt/<DETAILED_PROMPT>?width=1920&height=1080&model=flux&nologo=true&enhance=true&seed=${seed}`,
    '- Prompts must be detailed photography language (scene, lighting, lens, materials) AND include the brand name — NEVER short slugs like cozy_cafe_hero_image.',
    '- Every hero section must show a real visual (background-image or <img src=https...>). No broken-image icons.',
  ];
  if (/\b(?:cafe|coffee|restaurant|bistro|bakery)\b/i.test(t)) {
    const cafeUrl = uniqueHeroImageUrl(
      `unique ${brand} specialty coffee shop interior, original angle, warm wood, soft daylight, editorial, not a stock template`,
      brand,
      { salt: `cafe-${seed}` },
    );
    lines.push(
      `- Cafe/restaurant hero for THIS brand only (do not copy into other projects): ${cafeUrl}`,
    );
  }
  if (/\bapple\.com\b/i.test(t) || /^apple\.com$/i.test(projectName)) {
    const urls = appleStyleHeroImageUrls(brand);
    lines.push(
      'For this apple.com lookalike, use these unique image URLs (or equivalent pollinations prompts with the same seed idea):',
      `- iPhone hero: ${urls.iphone}`,
      `- MacBook hero: ${urls.macbook}`,
      `- Watch hero: ${urls.watch}`,
      `- AirPods hero: ${urls.airpods}`,
    );
  }
  return lines.join('\n');
}

function isBannedUnsplashUrl(url: string): boolean {
  const u = String(url || '');
  if (!/images\.unsplash\.com/i.test(u)) return false;
  return BANNED_UNSPLASH_IDS.some((id) => u.includes(id));
}

/** Rewrite weak / low-res Pollinations URLs already in source — never swap cafe → canned Unsplash. */
export function upgradePollinationsUrlsInSource(source: string, projectName = ''): string {
  const brand = String(projectName || '').trim();
  return String(source || '').replace(
    /https:\/\/image\.pollinations\.ai\/prompt\/([^"'?\s)]+)(\?[^"'\s)]*)?/gi,
    (_full, encPrompt: string, query = '') => {
      let prompt = '';
      try {
        prompt = decodeURIComponent(String(encPrompt || ''));
      } catch {
        prompt = String(encPrompt || '').replace(/\+/g, ' ');
      }
      const params = new URLSearchParams(String(query || '').replace(/^\?/, ''));
      const width = Math.max(1920, Number(params.get('width') || 0) || 1920);
      const height = Math.max(1080, Number(params.get('height') || 0) || 1080);
      const existingSeed = params.get('seed');
      // Thin cafe prompts → enrich + unique seed (do NOT replace with stock cafe photo).
      if (/\b(?:cafe|coffee|bistro|bakery|espresso)\b/i.test(prompt) && prompt.replace(/_/g, ' ').split(/\s+/).length < 10) {
        const rich = brand
          ? `${brand} specialty cafe interior, ${prompt}, original editorial photograph`
          : `${prompt}, original editorial cafe photograph, unique angle`;
        return pollinationsImageUrl(rich, {
          width,
          height,
          model: 'flux',
          seed: existingSeed || heroSeedForProject(brand || rich, 'cafe-thin'),
        });
      }
      return pollinationsImageUrl(prompt, {
        width,
        height,
        model: 'flux',
        seed: existingSeed || heroSeedForProject(brand || prompt, prompt.slice(0, 40)),
      });
    },
  );
}

/** Replace common broken placeholders + banned canned Unsplash heroes with unique generative URLs. */
export function repairBrokenSiteImageSrcs(appSource: string, brief: string, projectName = ''): string {
  const brand = String(projectName || '').trim()
    || (String(brief || '').match(/\b(?:called|named)\s+([A-Z][\w\s-]{1,40})/i)?.[1]?.trim())
    || 'brand';
  let s = upgradePollinationsUrlsInSource(String(appSource || ''), brand);
  if (!s) return s;
  const urls = appleStyleHeroImageUrls(brand);
  const isApple = /\bapple\.com\b/i.test(brief) || /iPhone|MacBook|AirPods/i.test(s);

  // Strip banned canned Unsplash IDs that made every cafe look identical.
  s = s.replace(/https:\/\/images\.unsplash\.com\/[^"')\s]+/gi, (m) => {
    if (!isBannedUnsplashUrl(m) && !/photo-1554118811|photo-1517248135|photo-150178|photo-1414235/i.test(m)) {
      // Still avoid any raw Unsplash stock — force unique generative for site heroes.
      if (/background|hero|cover|banner/i.test(s.slice(Math.max(0, s.indexOf(m) - 120), s.indexOf(m) + 40))) {
        return uniqueHeroImageUrl('unique full-bleed hero photograph matching the brand atmosphere', brand, {
          salt: `unsplash-strip-${heroSeedForProject(brand, m.slice(-12))}`,
        });
      }
    }
    return uniqueHeroImageUrl(
      /\b(?:cafe|coffee|bistro|bakery)\b/i.test(brief)
        ? `unique ${brand} cafe interior hero, warm light, editorial, original`
        : `unique ${brand} marketing hero photograph, editorial, original`,
      brand,
      { salt: `banned-${m.slice(-16)}` },
    );
  });

  s = s.replace(/https?:\/\/via\.placeholder\.com\/[^"')\s]+/gi, (m) => {
    if (/iphone/i.test(m) || /iphone/i.test(s.slice(Math.max(0, s.indexOf(m) - 80), s.indexOf(m)))) return urls.iphone;
    if (/macbook|mac/i.test(m)) return urls.macbook;
    if (/watch/i.test(m)) return urls.watch;
    if (/airpods|earbud/i.test(m)) return urls.airpods;
    return uniqueHeroImageUrl('premium product hero, soft studio, commercial photography', brand, { salt: 'ph' });
  });
  s = s.replace(
    /src=["']apple-logo\.png["']/gi,
    `src="${pollinationsImageUrl('minimal black apple logo glyph on transparent, simple icon', { width: 64, height: 64, seed: heroSeedForProject(brand, 'logo') })}"`,
  );
  s = s.replace(/src=["'][^"']*\.(?:png|jpg|jpeg|webp)["']/gi, (m) => {
    if (/https?:\/\//i.test(m) || /pollinations|unsplash|images\./i.test(m)) return m;
    if (!isApple) return m;
    if (/iphone/i.test(m)) return `src="${urls.iphone}"`;
    if (/mac/i.test(m)) return `src="${urls.macbook}"`;
    if (/watch/i.test(m)) return `src="${urls.watch}"`;
    if (/air/i.test(m)) return `src="${urls.airpods}"`;
    return m;
  });
  return s;
}
