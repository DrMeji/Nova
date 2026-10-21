/**
 * Single-object product visuals for Live projects.
 * Prefer local / Image Core (HF → local SD → AI Horde) → public/glyphs/*.png
 * Fallback: catalog-style offline SVG (white field + matte product) — never Unsplash.
 */

import { listReadyLocalImageModels } from '@/lib/siteHeroImages';
import { engineGenerate } from '@/lib/novaEngine';
import { normalizeMessyUiEditAsk } from '@/lib/editAskResolve';
import { looksLikeProductVisualObjectAsk } from '@/lib/createProjectIntent';

export type ProductVisualKind =
  | 'microphone'
  | 'headphones'
  | 'guitar'
  | 'keyboard'
  | 'mouse'
  | 'watch'
  | 'bottle'
  | 'phone'
  | 'gpu'
  | 'monitor'
  | 'speaker'
  | 'laptop'
  | 'generic';

/** True when the user wants a product object drawn onto the bound page. */
export function wantsProductVisualAsk(message: string): boolean {
  const t = normalizeMessyUiEditAsk(String(message || '')).trim();
  if (!t) return false;
  if (/\b(?:landing|homepage|full[- ]?bleed|shop\s+section|split\s+layout|graphic\s+design)\b/i.test(t)
    && /\b(?:tagline|headline|cart|add\s+to\s+cart)\b/i.test(t)) {
    return false;
  }
  return looksLikeProductVisualObjectAsk(t);
}

export function detectProductVisualKind(message: string): ProductVisualKind {
  const t = String(message || '');
  if (/\b(?:headphones?|headsets?|earbuds?)\b/i.test(t)) return 'headphones';
  if (/\b(?:guitars?)\b/i.test(t)) return 'guitar';
  if (/\b(?:keyboards?)\b/i.test(t)) return 'keyboard';
  if (/\b(?:mice|mouse)\b/i.test(t)) return 'mouse';
  if (/\b(?:watches?)\b/i.test(t)) return 'watch';
  if (/\b(?:bottles?)\b/i.test(t)) return 'bottle';
  if (/\b(?:gpus?|graphics\s*cards?)\b/i.test(t)) return 'gpu';
  if (/\b(?:monitors?|displays?)\b/i.test(t)) return 'monitor';
  if (/\b(?:google\s*homes?|smart\s*speakers?|speakers?)\b/i.test(t)) return 'speaker';
  if (/\b(?:laptops?|macbooks?)\b/i.test(t)) return 'laptop';
  if (/\b(?:iphones?|smartphones?|phones?|ipads?|tablets?)\b/i.test(t)) return 'phone';
  if (/\b(?:microphones?|mics?\b)\b/i.test(t)) return 'microphone';
  return 'generic';
}

function slugForKind(kind: ProductVisualKind): string {
  return kind === 'generic' ? 'product' : kind;
}

function labelForKind(kind: ProductVisualKind): string {
  const map: Record<ProductVisualKind, string> = {
    microphone: 'Microphone',
    headphones: 'Headphones',
    guitar: 'Guitar',
    keyboard: 'Keyboard',
    mouse: 'Mouse',
    watch: 'Watch',
    bottle: 'Bottle',
    phone: 'Phone',
    gpu: 'GPU',
    monitor: 'Monitor',
    speaker: 'Speaker',
    laptop: 'Laptop',
    generic: 'Product',
  };
  return map[kind] || 'Product';
}

/** ChatGPT-style catalog prompts: matte black subject, pure white field, soft shadow. */
function promptForKind(kind: ProductVisualKind, variant?: string): string {
  const catalog =
    'OBJECT ONLY — no person no face no model, matte black premium finish, isolated on seamless pure white background, soft natural contact shadow, centered, generous white space, Apple-style ecommerce catalog product photograph, no text, no watermark, no logo, sharp detail, clean studio lighting';
  const v = String(variant || '').toLowerCase();
  switch (kind) {
    case 'microphone':
      if (/clip|travel|lav/.test(v)) {
        return `studio product photograph of a small clip-on lavalier microphone, ${catalog}`;
      }
      if (/desk|dynamic/.test(v)) {
        return `studio product photograph of a desk dynamic microphone with mesh grille, ${catalog}`;
      }
      return `studio product photograph of a desktop condenser microphone on a round stand with U-shaped yoke and fine mesh grille, tiny blue LED, ${catalog}`;
    case 'headphones':
      return `studio product photograph of a single pair of wireless matte black over-ear studio headphones resting alone, three-quarter view preferred, thick padded headband, plush circular ear cups, soft directional studio light with gentle drop shadow, no boom microphone, no cables, no wires, ${catalog}`;
    case 'guitar':
      return `studio product photograph of a matte black electric guitar, ${catalog}`;
    case 'keyboard':
      return `studio product photograph of a full-size matte black mechanical keyboard from above, subtle blue key backlight, ${catalog}`;
    case 'mouse':
      return `studio product photograph of a matte black ergonomic wireless mouse from above, ${catalog}`;
    case 'watch':
      return `studio product photograph of a matte black smartwatch on a white field, ${catalog}`;
    case 'bottle':
      return `studio product photograph of a matte black water bottle, ${catalog}`;
    case 'phone':
      return `studio product photograph of a modern matte black smartphone front facing, ${catalog}`;
    case 'gpu':
      return `studio product photograph of a modern graphics card GPU, matte black shroud, ${catalog}`;
    case 'monitor':
      return `studio product photograph of a thin bezel computer monitor, dark frame, ${catalog}`;
    case 'speaker':
      return `studio product photograph of a cylindrical smart speaker, matte black, ${catalog}`;
    case 'laptop':
      return `studio product photograph of an open slim laptop, dark chassis, ${catalog}`;
    default:
      return `studio product photograph of a premium consumer electronics device, ${catalog}`;
  }
}

function joinDisk(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${rel.replace(/^[/\\]+/, '').replace(/\//g, sep)}`;
}

function publicHref(rel: string): string {
  return `/${rel.replace(/^public[/\\]/, '').replace(/\\/g, '/')}`;
}

function svgToBase64DataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** Rasterize catalog SVG → PNG data URL so Horde img2img keeps product-only framing. */
async function catalogSvgToPngDataUrl(svg: string, size = 768): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg raster failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return null;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function whiteFieldDefs(): string {
  return `<defs>
  <radialGradient id="floor" cx="50%" cy="72%" r="42%">
    <stop offset="0%" stop-color="#d8dce2" stop-opacity="0.55"/>
    <stop offset="55%" stop-color="#eef0f3" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="matte" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#3a3a3e"/><stop offset="45%" stop-color="#1a1a1c"/><stop offset="100%" stop-color="#0c0c0e"/>
  </linearGradient>
  <linearGradient id="matteSide" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#2a2a2e"/><stop offset="50%" stop-color="#141416"/><stop offset="100%" stop-color="#2e2e32"/>
  </linearGradient>
  <linearGradient id="pad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#2c2c30"/><stop offset="100%" stop-color="#121214"/>
  </linearGradient>
  <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.18"/>
  </filter>
</defs>
<rect width="1200" height="1200" fill="#ffffff"/>
<ellipse cx="600" cy="980" rx="280" ry="48" fill="url(#floor)"/>`;
}

/**
 * Offline catalog SVG — white field + matte black subject (ChatGPT ecommerce look),
 * not a dark green flat icon.
 */
export function productVisualFallbackSvg(kind: ProductVisualKind): string {
  if (kind === 'headphones') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <path d="M360 520 C360 300 840 300 840 520" fill="none" stroke="url(#matte)" stroke-width="52" stroke-linecap="round"/>
  <path d="M360 520 C360 340 840 340 840 520" fill="none" stroke="#4a4a50" stroke-width="10" stroke-linecap="round" opacity="0.35"/>
  <rect x="268" y="470" width="150" height="270" rx="72" fill="url(#matteSide)"/>
  <rect x="782" y="470" width="150" height="270" rx="72" fill="url(#matteSide)"/>
  <rect x="292" y="510" width="102" height="190" rx="48" fill="url(#pad)"/>
  <rect x="806" y="510" width="102" height="190" rx="48" fill="url(#pad)"/>
  <ellipse cx="343" cy="605" rx="28" ry="48" fill="#1e3a5f" opacity="0.35"/>
  <ellipse cx="857" cy="605" rx="28" ry="48" fill="#1e3a5f" opacity="0.35"/>
</g>
</svg>`;
  }
  if (kind === 'keyboard') {
    const keys = Array.from({ length: 14 }, (_, i) => {
      const col = i % 7;
      const row = Math.floor(i / 7);
      const x = 260 + col * 98;
      const y = 460 + row * 90;
      return `<rect x="${x}" y="${y}" width="82" height="72" rx="10" fill="#0e0e10"/><rect x="${x + 6}" y="${y + 6}" width="70" height="8" rx="2" fill="#3b82f6" opacity="0.55"/>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="180" y="400" width="840" height="320" rx="28" fill="url(#matte)"/>
  ${keys}
  <rect x="260" y="640" width="680" height="48" rx="10" fill="#0e0e10"/>
</g>
</svg>`;
  }
  if (kind === 'mouse') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <ellipse cx="600" cy="560" rx="190" ry="280" fill="url(#matte)"/>
  <path d="M600 300 L600 560" stroke="#3a3a40" stroke-width="4" opacity="0.5"/>
  <rect x="582" y="420" width="36" height="88" rx="12" fill="#2a2a30"/>
  <ellipse cx="600" cy="780" rx="70" ry="18" fill="#000" opacity="0.12"/>
</g>
</svg>`;
  }
  if (kind === 'watch') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="520" y="220" width="160" height="200" rx="28" fill="url(#matte)"/>
  <rect x="500" y="420" width="200" height="280" rx="48" fill="url(#matte)"/>
  <rect x="530" y="450" width="140" height="180" rx="32" fill="#0a0a0c"/>
  <circle cx="600" cy="540" r="8" fill="#3b82f6" opacity="0.8"/>
  <rect x="520" y="700" width="160" height="220" rx="28" fill="url(#matte)"/>
</g>
</svg>`;
  }
  if (kind === 'phone') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="420" y="180" width="360" height="740" rx="54" fill="url(#matte)"/>
  <rect x="444" y="220" width="312" height="640" rx="28" fill="#0a0a0c"/>
  <rect x="560" y="196" width="80" height="12" rx="6" fill="#2a2a30"/>
</g>
</svg>`;
  }
  if (kind === 'bottle') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="545" y="200" width="110" height="80" rx="16" fill="url(#matte)"/>
  <rect x="500" y="280" width="200" height="560" rx="72" fill="url(#matte)"/>
  <rect x="530" y="340" width="140" height="20" rx="8" fill="#3a3a42" opacity="0.5"/>
</g>
</svg>`;
  }
  if (kind === 'gpu') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="220" y="420" width="760" height="280" rx="24" fill="url(#matte)"/>
  <circle cx="400" cy="560" r="70" fill="#1a1a1e" stroke="#3a3a42" stroke-width="8"/>
  <circle cx="600" cy="560" r="70" fill="#1a1a1e" stroke="#3a3a42" stroke-width="8"/>
  <circle cx="800" cy="560" r="70" fill="#1a1a1e" stroke="#3a3a42" stroke-width="8"/>
  <rect x="260" y="640" width="120" height="28" rx="6" fill="#3b82f6" opacity="0.45"/>
</g>
</svg>`;
  }
  if (kind === 'monitor') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="220" y="260" width="760" height="460" rx="18" fill="url(#matte)"/>
  <rect x="250" y="290" width="700" height="380" rx="8" fill="#0a0a0c"/>
  <rect x="560" y="720" width="80" height="90" fill="url(#matte)"/>
  <rect x="420" y="810" width="360" height="28" rx="10" fill="url(#matte)"/>
</g>
</svg>`;
  }
  if (kind === 'speaker' || kind === 'laptop' || kind === 'guitar') {
    if (kind === 'speaker') {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="420" y="280" width="360" height="560" rx="180" fill="url(#matte)"/>
  <ellipse cx="600" cy="480" rx="90" ry="40" fill="#1a1a1e"/>
  <circle cx="600" cy="620" r="12" fill="#3b82f6" opacity="0.7"/>
</g>
</svg>`;
    }
    if (kind === 'laptop') {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="260" y="260" width="680" height="420" rx="18" fill="url(#matte)"/>
  <rect x="290" y="290" width="620" height="350" rx="8" fill="#0a0a0c"/>
  <rect x="220" y="680" width="760" height="48" rx="10" fill="url(#matte)"/>
</g>
</svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <rect x="575" y="160" width="50" height="360" rx="10" fill="url(#matte)"/>
  <ellipse cx="600" cy="720" rx="200" ry="240" fill="url(#matte)"/>
  <ellipse cx="600" cy="560" rx="100" ry="90" fill="url(#matte)"/>
  <circle cx="600" cy="700" r="55" fill="#0a0a0c"/>
</g>
</svg>`;
  }
  // Condenser mic on stand — matte black on white (matches ChatGPT mic quadrant)
  const grille = [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const y = 360 + i * 36;
      return `<ellipse cx="600" cy="${y}" rx="78" ry="10" fill="none" stroke="#4a4a52" stroke-opacity="0.55" stroke-width="3"/>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
${whiteFieldDefs()}
<g filter="url(#softShadow)">
  <ellipse cx="600" cy="980" rx="120" ry="22" fill="#1a1a1c"/>
  <rect x="578" y="760" width="44" height="210" rx="10" fill="url(#matte)"/>
  <path d="M440 620 C440 760 760 760 760 620" fill="none" stroke="#2a2a2e" stroke-width="20" stroke-linecap="round"/>
  <rect x="490" y="280" width="220" height="360" rx="100" fill="url(#matte)"/>
  ${grille}
  <circle cx="600" cy="520" r="14" fill="#3b82f6" opacity="0.75"/>
</g>
</svg>`;
}

function extractBrandFromMessage(message: string): { brand?: string; tagline?: string } {
  const t = String(message || '');
  const named = t.match(/\b(?:for|brand|named|called)\s+([A-Z][A-Za-z0-9]{2,24})\b/)
    || t.match(/\b([A-Z][a-z]+[A-Z][A-Za-z0-9]*)\b/); // HydroSip / AquaSip
  const brand = named?.[1]?.replace(/[<>&'"`]/g, '').slice(0, 40);
  const tag = t.match(/tagline\s+[“"']?([^“"'\n.]{6,60})/i)?.[1]
    || (/\bcarry less\b/i.test(t) ? 'Carry less. Drink more.' : undefined);
  return { brand, tagline: tag?.replace(/[<>&'"`]/g, '').slice(0, 80) };
}

function appShellForGlyph(
  href: string,
  label: string,
  opts?: { brand?: string; tagline?: string },
): { app: string; css: string; indexCss: string } {
  const safe = String(label || 'Product').replace(/[<>&'"`]/g, '').slice(0, 40);
  const brand = String(opts?.brand || '').replace(/[<>&'"`]/g, '').slice(0, 40);
  const tagline = String(opts?.tagline || '').replace(/[<>&'"`]/g, '').slice(0, 80);
  const brandBlock = brand
    ? `<header className="brand-lockup">
        <h1 className="brand-name">${brand}</h1>
        ${tagline ? `<p className="brand-tagline">${tagline}</p>` : ''}
      </header>`
    : '';
  const app = `import './App.css';

export default function App() {
  return (
    <div className="app" aria-label="Product stage">
      ${brandBlock}
      <div className="glyph-stage">
        <img className="glyph-visual" src="${href}" alt="${safe}" />
      </div>
      <p className="glyph-caption">${safe}</p>
    </div>
  );
}
`;
  const css = `html, body, #root { min-height: 100%; height: auto; margin: 0; background: #f3f1ec; }
.app{min-height:100svh;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;background:#f3f1ec;color:#1a1a1c;padding:2rem;box-sizing:border-box}
.brand-lockup{display:flex;flex-direction:column;align-items:center;gap:0.35rem;margin:0 0 0.25rem}
.brand-name{margin:0;font-family:Palatino,"Palatino Linotype",Georgia,serif;font-size:clamp(2rem,5vw,3rem);font-weight:600;letter-spacing:-0.03em}
.brand-tagline{margin:0;font-family:Georgia,"Times New Roman",serif;font-style:italic;opacity:.72;font-size:1.05rem}
.glyph-stage{width:min(88vw,28rem);aspect-ratio:1;border-radius:0.75rem;overflow:hidden;background:#ffffff;box-shadow:0 18px 48px rgba(0,0,0,.08)}
.glyph-visual{width:100%;height:100%;object-fit:cover;display:block;background:#fff}
.glyph-caption{margin:0;font-family:Palatino,"Palatino Linotype",Georgia,serif;font-size:1.05rem;letter-spacing:0.02em;opacity:.65}
`;
  const indexCss = `html, body, #root { min-height: 100%; height: auto; margin: 0; background: #f3f1ec; }\n`;
  return { app, css, indexCss };
}

async function pickImageModelId(): Promise<string> {
  try {
    const ready = await listReadyLocalImageModels();
    if (ready[0]?.id) return ready[0].id;
  } catch { /* ignore */ }
  return 'NOVA-image-core';
}

export type ProductVisualApplyResult = {
  ok: boolean;
  files: Record<string, string>;
  updated: string[];
  href: string;
  kind: ProductVisualKind;
  source: 'local-image' | 'image-core' | 'svg-fallback';
  error?: string;
};

async function writeGlyphFile(
  diskRoot: string,
  rel: string,
  dataUrlOrSvg: string,
  asSvgText?: boolean,
): Promise<boolean> {
  const desktop = typeof window !== 'undefined' ? window.novaDesktop : undefined;
  if (!desktop) return false;
  const targetPath = joinDisk(diskRoot, rel);
  if (asSvgText && desktop.workspaceWriteFile) {
    const w = await desktop.workspaceWriteFile({ targetPath, content: dataUrlOrSvg });
    return Boolean(w?.ok);
  }
  if (desktop.workspaceSaveAsset) {
    const payload = asSvgText
      ? { targetPath, base64: svgToBase64DataUrl(dataUrlOrSvg) }
      : { targetPath, base64: dataUrlOrSvg };
    const written = await desktop.workspaceSaveAsset(payload);
    return Boolean(written?.ok);
  }
  return false;
}

/**
 * Materialize one glyph file under public/glyphs/ (model preferred, SVG fallback).
 */
export async function materializeProductGlyph(opts: {
  diskRoot: string;
  kind: ProductVisualKind;
  slug?: string;
  variant?: string;
  files?: Record<string, string>;
  preferFallback?: boolean;
  /** Force regenerate even if a glyph already exists (upgrade SVG → photo). */
  force?: boolean;
}): Promise<{ ok: boolean; href: string; rel: string; source: ProductVisualApplyResult['source']; files: Record<string, string>; error?: string }> {
  const slug = opts.slug || slugForKind(opts.kind);
  let files = { ...(opts.files || {}) };
  const modelId = await pickImageModelId();
  const isLocalWeights = /sdxl-turbo-local|flux-schnell-local|sd15-local/i.test(modelId);
  const desktop = typeof window !== 'undefined' ? window.novaDesktop : undefined;
  let error: string | undefined;

  // Reuse a prior *photo* glyph; always try regenerate when only SVG exists (or force).
  const existing = findGlyphHrefInFiles(files, slug);
  const existingIsPhoto = existing && !/\.svg$/i.test(existing);
  if (existing && existingIsPhoto && !opts.force && !opts.preferFallback) {
    const relHit = Object.keys(files).find((k) => k.includes(`glyphs/${slug}.`));
    return {
      ok: true,
      href: existing,
      rel: relHit || `public/glyphs/${slug}.png`,
      source: 'local-image',
      files,
    };
  }

  if (!opts.preferFallback && desktop?.engineGenerate) {
    try {
      const catalogSvg = productVisualFallbackSvg(opts.kind);
      const refPng = await catalogSvgToPngDataUrl(catalogSvg, 512);
      const prompt = promptForKind(opts.kind, opts.variant);
      // Try img2img from catalog SVG first (locks product-only framing), then plain txt2img.
      let gen = await engineGenerate(prompt, modelId, 'image', {
        referenceImageDataUrl: refPng || undefined,
      });
      let dataUrl = gen?.ok && gen.media?.dataUrl ? String(gen.media.dataUrl) : '';
      if ((!dataUrl || /pollinations/i.test(String(gen?.source || ''))) && refPng) {
        gen = await engineGenerate(prompt, modelId, 'image');
        dataUrl = gen?.ok && gen.media?.dataUrl ? String(gen.media.dataUrl) : '';
      }
      if (dataUrl && /^data:image\//i.test(dataUrl) && !/pollinations/i.test(String(gen?.source || ''))) {
        const ext = /image\/png/i.test(dataUrl) ? 'png'
          : /image\/webp/i.test(dataUrl) ? 'webp'
          : /image\/svg/i.test(dataUrl) ? 'svg'
          : 'jpg';
        const rel = `public/glyphs/${slug}.${ext}`;
        const saved = await writeGlyphFile(opts.diskRoot, rel, dataUrl, ext === 'svg');
        if (saved) {
          files[rel] = ext === 'svg' ? '[svg]' : `[image:${ext}]`;
          const staleSvg = `public/glyphs/${slug}.svg`;
          if (ext !== 'svg' && files[staleSvg]) delete files[staleSvg];
          return {
            ok: true,
            href: publicHref(rel),
            rel,
            source: isLocalWeights ? 'local-image' : 'image-core',
            files,
          };
        }
        error = 'Could not save generated image';
      } else {
        error = String(gen?.reply || (gen as { error?: string })?.error || 'Image generation failed').slice(0, 240);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  } else if (opts.preferFallback) {
    error = 'Offline SVG preferred';
  } else {
    error = 'Image engine unavailable';
  }

  const rel = `public/glyphs/${slug}.svg`;
  const svg = productVisualFallbackSvg(opts.kind);
  await writeGlyphFile(opts.diskRoot, rel, svg, true);
  files[rel] = svg;
  return {
    ok: true,
    href: publicHref(rel),
    rel,
    source: 'svg-fallback',
    files,
    error,
  };
}

/** Generate (or fall back) a product visual and wire a minimal App stage. */
export async function applyProductVisualToProject(opts: {
  diskRoot: string;
  files: Record<string, string>;
  message: string;
}): Promise<ProductVisualApplyResult> {
  const kind = detectProductVisualKind(opts.message);
  const label = labelForKind(kind);
  const { brand, tagline } = extractBrandFromMessage(opts.message);
  // Prefer bound project folder name when ask has no brand (HydroSip, AquaSip, …)
  const folderBrand = (() => {
    const base = String(opts.diskRoot || '').replace(/[/\\]+$/, '').split(/[/\\]/).pop() || '';
    if (/^(?:HydroSip|AquaSip|LiveGlyphSuite|GlyphStage|QualityStage)/i.test(base)) return base.replace(/-\d+$/, '');
    if (/^[A-Z][a-z]+[A-Z]/.test(base) && base.length <= 28) return base;
    return undefined;
  })();

  const mat = await materializeProductGlyph({
    diskRoot: opts.diskRoot,
    kind,
    files: opts.files,
    force: true,
  });

  let files = { ...mat.files };
  const shell = appShellForGlyph(mat.href, label, {
    brand: brand || folderBrand,
    tagline: tagline || (kind === 'bottle' ? 'Carry less. Drink more.' : undefined),
  });
  files['src/App.jsx'] = shell.app;
  files['src/App.css'] = shell.css;
  files['src/index.css'] = shell.indexCss;

  const desktop = typeof window !== 'undefined' ? window.novaDesktop : undefined;
  if (desktop?.workspaceWriteFile) {
    for (const p of ['src/App.jsx', 'src/App.css', 'src/index.css'] as const) {
      await desktop.workspaceWriteFile({
        targetPath: joinDisk(opts.diskRoot, p),
        content: files[p],
      });
    }
  }

  return {
    ok: true,
    files,
    updated: ['src/App.jsx', 'src/App.css', 'src/index.css', mat.rel],
    href: mat.href,
    kind,
    source: mat.source,
    error: mat.source === 'svg-fallback' ? mat.error : undefined,
  };
}

export function findGlyphHrefInFiles(
  files: Record<string, string>,
  slug: string,
): string | null {
  const keys = Object.keys(files || {});
  // Prefer raster over SVG when both exist.
  const rasters = keys.filter((k) => new RegExp(`(?:^|[/\\\\])(?:public[/\\\\])?glyphs[/\\\\]${slug}\\.(?:png|jpe?g|webp)$`, 'i').test(k));
  const svgs = keys.filter((k) => new RegExp(`(?:^|[/\\\\])(?:public[/\\\\])?glyphs[/\\\\]${slug}\\.svg$`, 'i').test(k));
  const hit = rasters[0] || svgs[0];
  if (!hit) return null;
  return publicHref(hit.replace(/\\/g, '/').replace(/^.*?public\//i, 'public/'));
}

export function productGlyphImgTag(
  href: string,
  className: string,
  alt: string,
): string {
  const safeAlt = String(alt || 'Product').replace(/[<>&'"`]/g, '').slice(0, 40);
  const cls = String(className || 'stage-glyph').replace(/[<>&'"`]/g, '');
  return `<img className="${cls}" src="${href}" alt="${safeAlt}" />`;
}

export function glyphPublicPath(kind: ProductVisualKind, ext: 'png' | 'jpg' | 'svg' = 'svg'): string {
  return `/glyphs/${slugForKind(kind)}.${ext}`;
}
