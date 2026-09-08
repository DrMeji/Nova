/**
 * Hero / product imagery for marketing-site creates.
 * Prefers high-res Pollinations (Flux) or Unsplash so Preview is not blurry/pixelated.
 */

export type PollinationsImageOpts = {
  width?: number;
  height?: number;
  model?: string;
};

/** Turn slug-y model prompts into real photography language. */
export function enrichImagePrompt(prompt: string): string {
  let p = String(prompt || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!p) p = 'premium commercial photography';
  // Thin prompts like "cozy cafe hero image" → add camera / lighting cues.
  if (p.length < 48 || /^(?:cozy|warm|nice|beautiful|cool)\b/i.test(p) && p.split(' ').length < 8) {
    p = `${p}, professional photography, sharp focus, natural lighting, high detail, 35mm, editorial quality`;
  }
  if (!/\b(?:photo|photograph|photography|cinematic|studio|lens|dslr|35mm|editorial)\b/i.test(p)) {
    p = `${p}, professional photograph, sharp detail`;
  }
  return p.slice(0, 280);
}

export function pollinationsImageUrl(prompt: string, opts?: PollinationsImageOpts): string {
  const w = Math.max(1280, opts?.width ?? 1920);
  const h = Math.max(720, opts?.height ?? 1080);
  const model = opts?.model || 'flux';
  const q = encodeURIComponent(enrichImagePrompt(prompt));
  return `https://image.pollinations.ai/prompt/${q}?width=${w}&height=${h}&model=${model}&nologo=true&enhance=true`;
}

/** Real cafe / restaurant stock when a generative URL would look soft. */
export function unsplashHeroUrl(kind: 'cafe' | 'restaurant' | 'product' | 'generic' = 'generic'): string {
  const ids: Record<typeof kind, string> = {
    cafe: '1554118811-1e0d58224f24',
    restaurant: '1517248135467-4c7edcad34c4',
    product: '1523275335684-37898b6baf30',
    generic: '1497366216548-37526070297c',
  };
  return `https://images.unsplash.com/photo-${ids[kind]}?auto=format&fit=crop&w=1920&q=85`;
}

/** Apple.com-style product hero prompts (private lookalike tests). */
export function appleStyleHeroImageUrls(): Record<string, string> {
  return {
    iphone: pollinationsImageUrl(
      'premium smartphone product hero on soft gradient studio backdrop, apple-like minimal photography, centered device, high end commercial, sharp focus',
      { width: 1920, height: 1280 },
    ),
    macbook: pollinationsImageUrl(
      'premium laptop product hero open on desk, soft daylight, minimal apple-like commercial photography, centered, sharp detail',
      { width: 1920, height: 1280 },
    ),
    watch: pollinationsImageUrl(
      'premium smartwatch product hero close up, soft gradient studio, minimal commercial photography, macro sharp',
      { width: 1600, height: 1200 },
    ),
    airpods: pollinationsImageUrl(
      'premium wireless earbuds product hero with charging case, soft studio lighting, minimal commercial photography, sharp',
      { width: 1600, height: 1200 },
    ),
  };
}

export function siteImageGuidanceForBrief(brief: string, projectName: string): string {
  const t = `${brief}\n${projectName}`;
  const lines = [
    'IMAGES (required for marketing / replica sites):',
    '- Never use via.placeholder.com, placehold.co, or broken local files like apple-logo.png unless you also emit the binary.',
    '- Prefer Unsplash crop URLs for real photography: https://images.unsplash.com/photo-…?auto=format&fit=crop&w=1920&q=85',
    '- Or Pollinations Flux: https://image.pollinations.ai/prompt/<DETAILED_PROMPT>?width=1920&height=1080&model=flux&nologo=true&enhance=true',
    '- Prompts must be detailed photography language (scene, lighting, lens) — NEVER short slugs like cozy_cafe_hero_image.',
    '- Every hero section must show a real visual (background-image or <img src=https...>). No broken-image icons. No blurry stretched tiny images.',
  ];
  if (/\b(?:cafe|coffee|restaurant|bistro|bakery)\b/i.test(t)) {
    lines.push(
      `- Cafe/restaurant hero (recommended Unsplash): ${unsplashHeroUrl('cafe')}`,
    );
  }
  if (/\bapple\.com\b/i.test(t) || /^apple\.com$/i.test(projectName)) {
    const urls = appleStyleHeroImageUrls();
    lines.push(
      'For this apple.com lookalike, use these image URLs (or equivalent pollinations prompts):',
      `- iPhone hero: ${urls.iphone}`,
      `- MacBook hero: ${urls.macbook}`,
      `- Watch hero: ${urls.watch}`,
      `- AirPods hero: ${urls.airpods}`,
    );
  }
  return lines.join('\n');
}

/** Rewrite weak / low-res Pollinations URLs already in source. */
export function upgradePollinationsUrlsInSource(source: string): string {
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
      // Cafe-ish thin prompts → real Unsplash photo (sharper than generative).
      if (/\b(?:cafe|coffee|bistro|bakery|espresso)\b/i.test(prompt) && prompt.replace(/_/g, ' ').split(/\s+/).length < 10) {
        return unsplashHeroUrl('cafe');
      }
      return pollinationsImageUrl(prompt, { width, height, model: 'flux' });
    },
  );
}

/** Replace common broken placeholders in App source with pollinations heroes. */
export function repairBrokenSiteImageSrcs(appSource: string, brief: string): string {
  let s = upgradePollinationsUrlsInSource(String(appSource || ''));
  if (!s) return s;
  const urls = appleStyleHeroImageUrls();
  const isApple = /\bapple\.com\b/i.test(brief) || /iPhone|MacBook|AirPods/i.test(s);
  s = s.replace(/https?:\/\/via\.placeholder\.com\/[^"')\s]+/gi, (m) => {
    if (/iphone/i.test(m) || /iphone/i.test(s.slice(Math.max(0, s.indexOf(m) - 80), s.indexOf(m)))) return urls.iphone;
    if (/macbook|mac/i.test(m)) return urls.macbook;
    if (/watch/i.test(m)) return urls.watch;
    if (/airpods|earbud/i.test(m)) return urls.airpods;
    return urls.iphone;
  });
  s = s.replace(/src=["']apple-logo\.png["']/gi, `src="${pollinationsImageUrl('minimal black apple logo glyph on transparent, simple icon', { width: 64, height: 64 })}"`);
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
