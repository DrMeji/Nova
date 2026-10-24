import fs from 'fs';
import path from 'path';
import os from 'os';
import { looksLikeInventFloorTwin } from '../src/lib/createThinPath.ts';

const root = path.join(os.homedir(), 'Documents', 'NOVA Projects');

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
  walk('src');
  return files;
}

function read(slug) {
  const files = loadFiles(slug);
  const hero = files['src/sections/HeroSection.jsx'] || '';
  const cat = files['src/sections/CatalogSection.jsx'] || '';
  const story = files['src/sections/StorySection.jsx'] || '';
  const foot = files['src/sections/FooterSection.jsx'] || '';
  return {
    slug,
    twin: looksLikeInventFloorTwin(files),
    heroSalt: (hero.match(/data-nova-layout-salt="(\d)"/) || [])[1] || 'none',
    catSalt: (cat.match(/data-nova-layout-salt="(\d)"/) || [])[1] || 'none',
    heroClass: (hero.match(/hero-layout-\d|hero-split|hero-stack|hero-center|hero-fullbleed/) || ['?'])[0],
    grid: (cat.match(/catalog-grid-[\w-]+|catalog-layout-\d/) || ['?'])[0],
    skus: [...cat.matchAll(/name:\s*["']([^"']+)["']/g)].map((m) => m[1]).slice(0, 4),
    storyH: (story.match(/<h2[^>]*>([^<]+)/) || [])[1],
    footer: (foot.match(/<p>([^<]+)/) || [])[1],
  };
}

const A = read('linen-latch-atelier');
const B = read('slate-latch-atelier');
const C = read('quill-latch-atelier');
console.log(JSON.stringify({ linen: A, slate: B, quillLegacy: C }, null, 2));
const differ =
  A.heroSalt !== B.heroSalt
  || A.catSalt !== B.catSalt
  || A.heroClass !== B.heroClass
  || A.grid !== B.grid
  || A.storyH !== B.storyH
  || A.footer !== B.footer;
const bothBroken = A.twin === false && B.twin === false;
console.log(differ ? 'UNIQUENESS LIVE PASS' : 'UNIQUENESS LIVE FAIL');
console.log(bothBroken ? 'TWIN CLEARED PASS' : 'TWIN CLEARED FAIL');
process.exit(differ && bothBroken ? 0 : 2);
