/**
 * Invent uniqueness loop helper — fingerprint Accs and score twins.
 *
 *   node scripts/_invent-uniqueness-loop.mjs fingerprint
 *   node scripts/_invent-uniqueness-loop.mjs compare <slugA> <slugB>
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const root = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const require = createRequire(import.meta.url);

async function loadTwin() {
  // Prefer compiled? Use tsx path via dynamic import from source when run under tsx.
  try {
    const mod = await import('../src/lib/createThinPath.ts');
    return mod.looksLikeInventFloorTwin;
  } catch {
    return () => false;
  }
}

function readText(dir, rel) {
  const p = path.join(dir, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

export function fingerprint(slug) {
  const dir = path.join(root, slug);
  if (!fs.existsSync(dir)) return { slug, missing: true };
  const hero = readText(dir, 'src/sections/HeroSection.jsx');
  const cat = readText(dir, 'src/sections/CatalogSection.jsx');
  const story = readText(dir, 'src/sections/StorySection.jsx');
  const foot = readText(dir, 'src/sections/FooterSection.jsx');
  const nav = readText(dir, 'src/sections/NavHeaderSection.jsx');
  const hcss = readText(dir, 'src/sections/HeroSection.css');
  const ccss = readText(dir, 'src/sections/CatalogSection.css');
  const logo = readText(dir, 'public/logo.svg');
  const skus = [...cat.matchAll(/name:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const heroClass = (hero.match(/hero-layout-\d|hero-split|hero-stack|hero-center|hero-fullbleed/) || ['none'])[0];
  const grid = (cat.match(/catalog-grid-[\w-]+|catalog-layout-\d/) || ['none'])[0];
  const heroSalt = (hero.match(/data-nova-layout-salt="(\d)"/) || [])[1] || 'none';
  const catSalt = (cat.match(/data-nova-layout-salt="(\d)"/) || [])[1] || 'none';
  const kicker = (hero.match(/hero-kicker[^>]*>([^<]+)/) || [])[1] || '';
  const storyH = (story.match(/<h2[^>]*>([^<]+)/) || [])[1] || '';
  const footer = (foot.match(/<p>([^<]+)/) || [])[1] || '';
  const classicSvg = /M560 320 L620 250|M560%20320%20L620%20250/.test(hero);
  const layoutKey = [heroSalt, catSalt, heroClass, grid, storyH, footer.slice(0, 40), classicSvg ? 'svg0' : 'svgX'].join('|');
  return {
    slug,
    layoutKey,
    heroSalt,
    catSalt,
    heroClass,
    grid,
    skus: skus.slice(0, 4),
    kicker,
    storyH,
    footer,
    classicSvg,
    logoBytes: logo.length,
    heroCssBytes: hcss.length,
    catCssBytes: ccss.length,
    navHasLogo: /nav-logo|logo\.svg/.test(nav),
  };
}

function listLatch() {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((n) => /-latch-atelier$/i.test(n) || /latch-atelier$/i.test(n))
    .sort();
}

const cmd = process.argv[2] || 'fingerprint';
const looksLikeInventFloorTwin = await loadTwin();

if (cmd === 'fingerprint') {
  const all = listLatch().map(fingerprint).filter((f) => !f.missing);
  const byKey = new Map();
  for (const f of all) {
    const arr = byKey.get(f.layoutKey) || [];
    arr.push(f.slug);
    byKey.set(f.layoutKey, arr);
  }
  const collisions = [...byKey.entries()].filter(([, slugs]) => slugs.length > 1);
  console.log(JSON.stringify({
    count: all.length,
    collisions: collisions.map(([k, slugs]) => ({ key: k, slugs })),
    recent: all.slice(-8),
  }, null, 2));
  process.exit(collisions.length ? 2 : 0);
}

if (cmd === 'compare') {
  const a = fingerprint(process.argv[3]);
  const b = fingerprint(process.argv[4]);
  const twinA = looksLikeInventFloorTwin(loadFiles(a.slug));
  const twinB = looksLikeInventFloorTwin(loadFiles(b.slug));
  const same = a.layoutKey === b.layoutKey;
  console.log(JSON.stringify({ a: { ...a, twin: twinA }, b: { ...b, twin: twinB }, sameLayout: same }, null, 2));
  process.exit(same || twinA || twinB ? 2 : 0);
}

function loadFiles(slug) {
  const dir = path.join(root, slug);
  const files = {};
  const walk = (rel) => {
    const full = path.join(dir, rel);
    if (!fs.existsSync(full)) return;
    if (fs.statSync(full).isDirectory()) {
      for (const n of fs.readdirSync(full)) walk(path.join(rel, n).replace(/\\/g, '/'));
      return;
    }
    if (/\.(jsx?|tsx?|css)$/i.test(rel)) files[rel.replace(/\\/g, '/')] = fs.readFileSync(full, 'utf8');
  };
  if (fs.existsSync(dir)) walk('src');
  return files;
}

if (cmd === 'score') {
  const slug = process.argv[3];
  const fp = fingerprint(slug);
  const twin = looksLikeInventFloorTwin(loadFiles(slug));
  const priors = listLatch().filter((s) => s !== slug).map(fingerprint);
  const collide = priors.filter((p) => p.layoutKey === fp.layoutKey).map((p) => p.slug);
  const fail = twin || collide.length > 0 || fp.heroSalt === 'none' || fp.classicSvg;
  console.log(JSON.stringify({ fp, twin, collide, pass: !fail }, null, 2));
  process.exit(fail ? 2 : 0);
}
