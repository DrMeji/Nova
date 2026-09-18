/**
 * Hero / product imagery for marketing-site creates.
 * Site creates prefer Brand Assets (uploads, pasted URLs, Openverse, Iconify).
 * Pollinations helpers remain for the Image tab only — never injected into creates.
 */

import { getEngineStatus } from '@/lib/arkEngine';
import { hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { createIdentityFromBrief } from '@/lib/createIdentity';

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

/** Image-tab / explicit gen only — do not call from site create prompts. */
export function pollinationsImageUrl(prompt: string, opts?: PollinationsImageOpts): string {
  const w = Math.max(1280, opts?.width ?? 1920);
  const h = Math.max(720, opts?.height ?? 1080);
  const model = opts?.model || 'flux';
  const q = encodeURIComponent(enrichImagePrompt(prompt));
  const seed = opts?.seed != null ? String(opts.seed) : String(Date.now() % 1_000_000_000);
  return `https://image.pollinations.ai/prompt/${q}?width=${w}&height=${h}&model=${model}&nologo=true&enhance=true&seed=${encodeURIComponent(seed)}`;
}

/**
 * Unique hero URL helper (Image tab / legacy). Site creates must not inject these.
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

/** @deprecated Kept only so old imports compile — prefer Brand Assets local paths. */
export function unsplashHeroUrl(kind: 'cafe' | 'restaurant' | 'product' | 'generic' = 'generic'): string {
  const scenes: Record<typeof kind, string> = {
    cafe: 'warm specialty coffee shop interior, wooden counter, soft morning light, editorial',
    restaurant: 'fine dining restaurant dining room, candlelight, linen tables, editorial',
    product: 'premium product hero on soft studio backdrop, commercial photography',
    generic: 'modern architectural interior with soft daylight, editorial photography',
  };
  return uniqueHeroImageUrl(scenes[kind], `nova-${kind}`, { salt: kind });
}

/** Apple.com-style product hero prompts — Image tab only; creates use /heroes/*.jpg. */
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
 * Optional nudge for original generated heroes. Site creates still work via Brand Assets.
 */
export function siteImageCapabilityGapReply(opts?: {
  projectName?: string;
  readyLocal?: Array<{ id: string; name: string }>;
  hasCloudKey?: boolean;
  brief?: string;
}): string | null {
  if (opts?.readyLocal?.length) return null;
  if (opts?.hasCloudKey) return null;
  const name = String(opts?.projectName || 'this site').trim() || 'this site';
  const foodBrief = /\b(?:cafe|coffee|restaurant|bistro|bakery|food|dining)\b/i.test(
    `${opts?.brief || ''} ${name}`,
  );
  const lines = [
    `**${name}** looks best with real photos (upload in chat, or paste Unsplash/Pexels/Openverse links).`,
    '',
    foodBrief
      ? 'Optional: install an **image generation** model for original hero photography:'
      : 'Optional: install an **image generation** model for original hero photography:',
    ...RECOMMENDED_SITE_IMAGE_MODELS.map(
      (m) => `- **${m.name}** → ${m.where}`,
    ),
    '',
    `Start with **${RECOMMENDED_SITE_IMAGE_MODEL_NAME}** if you are unsure.`,
    '',
    '**Or** Models → Cloud → add a Hugging Face / OpenAI **image** key (not a chat key).',
    '',
    'Until then, NOVA uses Brand Assets (Iconify + Openverse + your uploads/links) — not Pollinations hotlinks.',
  ];
  return lines.join('\n');
}

export function siteImageGuidanceForBrief(_brief: string, _projectName: string): string {
  return [
    'IMAGES (required for marketing / replica sites):',
    '- Prefer NOVA Brand Assets already listed: /logo.svg, /icons/*.svg, /heroes/*.jpg (files on disk in public/).',
    '- If the user pasted image/icon URLs or attached photos, those win — use the local paths Brand Assets writes.',
    '- NEVER scrape apple.com / akamai product CDN. NEVER use via.placeholder.com or placehold.co.',
    '- NEVER reuse a canned cafe Unsplash photo ID. Unique Openverse search or user-pasted URLs only.',
    '- NEVER hotlink image.pollinations.ai — Pollinations is disabled for site creates.',
    '- Every hero must show a real visual. Nav logo must be an SVG <img>, not generated pixels.',
    '- Professional icons: use Iconify SVGs under /icons/*.svg (lucide / simple-icons), not AI-generated glyphs.',
  ].join('\n');
}

function isBannedUnsplashUrl(url: string): boolean {
  const u = String(url || '');
  if (!/images\.unsplash\.com/i.test(u)) return false;
  return BANNED_UNSPLASH_IDS.some((id) => u.includes(id));
}

/** Local hero path for this brand — never the shared generic hero.jpg slot. */
function identityHeroPaths(projectName: string, brief = '') {
  const id = createIdentityFromBrief(projectName || 'brand', brief);
  const story = id.heroQueries[1]
    ? `/heroes/${id.heroQueries[1].id}.jpg`
    : id.heroHref.replace(/-hero(\.|$)/, '-story$1');
  return { hero: id.heroHref, story, id };
}

/** Strip Pollinations hotlinks — replace with identity slug hero paths (no shared hero.jpg). */
export function upgradePollinationsUrlsInSource(source: string, projectName = '', brief = ''): string {
  let s = String(source || '');
  if (!s) return s;
  const { hero, story } = identityHeroPaths(projectName, brief || projectName);
  let heroN = 0;
  const nextHero = () => {
    heroN += 1;
    return heroN === 1 ? hero : heroN === 2 ? story : `/heroes/${String(projectName || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'brand'}-hero-${heroN}.jpg`;
  };
  s = s.replace(
    /url\((['"]?)https:\/\/image\.pollinations\.ai\/[^)'"]+\1\)/gi,
    () => `url('${nextHero()}')`,
  );
  s = s.replace(
    /src=(["'])https:\/\/image\.pollinations\.ai\/[^"']+\1/gi,
    (_m, q: string) => `src=${q}${nextHero()}${q}`,
  );
  s = s.replace(
    /https:\/\/image\.pollinations\.ai\/prompt\/[^"'\s)]+/gi,
    () => nextHero(),
  );
  return s;
}

/** Fix banned Unsplash + placeholders — never inject Pollinations or shared hero.jpg. */
export function repairBrokenSiteImageSrcs(appSource: string, brief: string, projectName = ''): string {
  const brand = String(projectName || '').trim()
    || (String(brief || '').match(/\b(?:called|named)\s+([A-Z][\w\s-]{1,40})/i)?.[1]?.trim())
    || 'brand';
  const { hero } = identityHeroPaths(brand, brief);
  let s = upgradePollinationsUrlsInSource(String(appSource || ''), brand, brief);
  if (!s) return s;
  const isApple = /\bapple\.com\b/i.test(brief) || /iPhone|MacBook|AirPods/i.test(s);

  s = s.replace(/https:\/\/images\.unsplash\.com\/[^"')\s]+/gi, (m) => {
    if (!isBannedUnsplashUrl(m) && !/photo-1554118811|photo-1517248135|photo-150178|photo-1414235/i.test(m)) {
      return m;
    }
    return hero;
  });

  s = s.replace(/https?:\/\/via\.placeholder\.com\/[^"')\s]+/gi, (m) => {
    if (/iphone/i.test(m) || /iphone/i.test(s.slice(Math.max(0, s.indexOf(m) - 80), s.indexOf(m)))) {
      return '/heroes/iphone.jpg';
    }
    if (/macbook|mac/i.test(m)) return '/heroes/macbook.jpg';
    if (/watch/i.test(m)) return '/heroes/watch.jpg';
    if (/airpods|earbud/i.test(m)) return '/heroes/airpods.jpg';
    return hero;
  });
  s = s.replace(/https?:\/\/placehold\.co\/[^"')\s]+/gi, () => hero);
  // Legacy shared slot → identity slug
  s = s.replace(/\/heroes\/hero\.jpg/gi, hero);
  s = s.replace(/src=["']apple-logo\.png["']/gi, 'src="/logo.svg"');
  s = s.replace(/src=["'][^"']*\.(?:png|jpg|jpeg|webp)["']/gi, (m) => {
    if (/https?:\/\//i.test(m) || /\/(?:logo|icons?|heroes?)\//i.test(m) || /unsplash|images\.|pexels|openverse/i.test(m)) {
      return m;
    }
    if (!isApple) return m;
    if (/iphone/i.test(m)) return 'src="/heroes/iphone.jpg"';
    if (/mac/i.test(m)) return 'src="/heroes/macbook.jpg"';
    if (/watch/i.test(m)) return 'src="/heroes/watch.jpg"';
    if (/air/i.test(m)) return 'src="/heroes/airpods.jpg"';
    return m;
  });
  return s;
}
