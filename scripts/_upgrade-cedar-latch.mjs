import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Use tsx loader via dynamic import of compiled sources through node --import tsx
const root = 'C:/Users/thoma/Documents/NOVA Projects/cedar-latch-atelier';
const brief = 'Create a new website project for a professional premium leather-goods atelier site. Soft parchment paper background, deep espresso navy type, warm brass accent. Handcrafted bags.';
const brand = 'Cedar Latch Atelier';

const { ensureRelativeCssImportsExist, assembleCompositionalAppShell } = await import('../src/lib/createThinPath.ts');
const { svgHeroDataUrl } = await import('../src/lib/createIdentity.ts');

const rels = [
  'src/App.jsx', 'src/App.css',
  'src/sections/NavHeaderSection.jsx', 'src/sections/HeroSection.jsx',
  'src/sections/CatalogSection.jsx', 'src/sections/StorySection.jsx', 'src/sections/FooterSection.jsx',
  'src/sections/NavHeaderSection.css', 'src/sections/HeroSection.css',
  'src/sections/CatalogSection.css', 'src/sections/StorySection.css', 'src/sections/FooterSection.css',
];

const files = {};
for (const rel of rels) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) files[rel] = fs.readFileSync(p, 'utf8');
}

let next = ensureRelativeCssImportsExist(files);
next = assembleCompositionalAppShell(next, brief, brand);

const heroUrl = svgHeroDataUrl({ name: brand, brief });
const heroJsx = String(next['src/sections/HeroSection.jsx'] || '');
if (/const HERO_VISUAL\s*=/.test(heroJsx)) {
  next['src/sections/HeroSection.jsx'] = heroJsx.replace(
    /const HERO_VISUAL\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`);/,
    `const HERO_VISUAL = ${JSON.stringify(heroUrl)};`,
  );
}

let appCss = String(next['src/App.css'] || '');
appCss = appCss
  .replace(
    /\.hero \{ min-height: 48vh; display: grid; place-items: center; text-align: center; padding: 3\.5rem 1\.25rem 2\.5rem; \}/,
    '.hero:not(.hero-section):not(.hero-fullbleed) { min-height: 48vh; display: grid; place-items: center; text-align: center; padding: 3.5rem 1.25rem 2.5rem; }',
  )
  .replace(
    /\.hero img, \.hero-photo \{ max-width: min\(920px, 92vw\); width: 100%; border-radius: 16px; border: 1px solid var\(--line\); object-fit: cover; \}/,
    '.hero:not(.hero-section):not(.hero-fullbleed) img, .hero:not(.hero-section):not(.hero-fullbleed) .hero-photo { max-width: min(920px, 92vw); width: 100%; border-radius: 16px; border: 1px solid var(--line); object-fit: cover; }',
  );
if (!/\.product-swatch/.test(appCss)) {
  appCss += '\n.product-swatch { width:100%; aspect-ratio:4/3; border-radius:12px; background: linear-gradient(145deg,#c4a574,#8b6914 55%,#5c4030); }\n';
}
if (!/\.hero-section\.hero-fullbleed/.test(appCss)) {
  appCss += `
.hero-section.hero-fullbleed { position: relative; min-height: 88vh; display: grid; align-items: end; padding: 0; overflow: hidden; }
.hero-section.hero-fullbleed .hero-stage { position: absolute; inset: 0; z-index: 0; opacity: 0.42; pointer-events: none; }
.hero-section.hero-fullbleed .hero-art { width: 100%; height: 100%; object-fit: cover; border: 0; border-radius: 0; max-width: none; }
.hero-section.hero-fullbleed .hero-veil { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.hero-section.hero-fullbleed .hero-copy { position: relative; z-index: 2; padding: 5.5rem 8vw 4.25rem; max-width: 40rem; text-align: left; }
`;
}
next['src/App.css'] = appCss;

for (const [rel, body] of Object.entries(next)) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  console.log('wrote', rel, body.length);
}

console.log('hero has data-frame?', /data-frame/.test(heroUrl));
console.log('hero has blue chrome?', /5b9fd4/.test(heroUrl));
console.log('App mounts', (next['src/App.jsx'].match(/<[A-Za-z]+(?:Section)?\b/g) || []).join(' -> '));
void require;
