/**
 * Invent-demo layouts must not be palette twins across genres.
 */
import { composeInventDemoSite } from '@/lib/createInventDemo';
import { thinBlocksLivePreview, filesHaveInventDemoSite } from '@/lib/createThinPath';
import { previewReadyForBrief } from '@/lib/createBuildQuality';

const cases = [
  { brand: 'WarpAtelier X', brief: 'textile atelier landing contact form' },
  { brand: 'NorthCup Y', brief: 'neighborhood coffee café landing contact form' },
  { brand: 'LensRoom Z', brief: 'photographer portfolio landing contact form' },
  { brand: 'Ridgeline Carry Q', brief: 'travel luggage carry-on suitcase bags shop with 12 unique bags contact form' },
];

const pkg = '{"name":"x","dependencies":{"react":"18","react-dom":"18"},"devDependencies":{"vite":"5","@vitejs/plugin-react":"4"}}';
const vite = "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n";

const apps = [];
for (const c of cases) {
  const d = composeInventDemoSite(c);
  const files = { ...d.files, 'package.json': pkg, 'vite.config.js': vite };
  const layout = (d.files['src/App.jsx'].match(/data-nova-layout="([^"]+)"/) || [])[1];
  const blocked = thinBlocksLivePreview(files, c.brief, c.brand);
  const ready = previewReadyForBrief(files, { productName: c.brand, brief: c.brief });
  if (!filesHaveInventDemoSite(files) || blocked || !ready.ok) {
    console.error('gate fail', c.brand, { layout, blocked, ready: ready.ok, reasons: ready.reasons });
    process.exit(1);
  }
  apps.push({
    brand: c.brand,
    layout,
    note: d.note,
    app: d.files['src/App.jsx'],
    css: d.files['src/App.css'],
  });
  console.log(c.brand, '→', layout, d.note);
}

const layouts = new Set(apps.map((a) => a.layout));
if (layouts.size < 4) {
  console.error('FAIL: expected 4 distinct layouts, got', [...layouts]);
  process.exit(1);
}

// Structural fingerprints must differ (not just brand/palette tokens).
const fingerprints = apps.map((a) => ({
  brand: a.brand,
  hasRail: /layout-atelier|className="rail"/.test(a.app),
  hasHoursBar: /hours-bar|layout-cafe/.test(a.app),
  hasWorkList: /work-list|layout-portfolio/.test(a.app),
  hasStrips: /className="strips"/.test(a.app),
  hasBoard: /className="board"/.test(a.app),
  hasSplitHero: /split-hero/.test(a.app),
}));

const atelier = fingerprints.find((f) => f.brand.includes('WarpAtelier'));
const cafe = fingerprints.find((f) => f.brand.includes('NorthCup'));
const pf = fingerprints.find((f) => f.brand.includes('LensRoom'));
const lug = apps.find((a) => a.brand.includes('Ridgeline'));

if (!atelier?.hasRail || !atelier?.hasStrips) {
  console.error('FAIL: atelier missing rail/strips', atelier);
  process.exit(1);
}
if (!cafe?.hasHoursBar || !cafe?.hasBoard) {
  console.error('FAIL: cafe missing hours/board', cafe);
  process.exit(1);
}
if (!pf?.hasWorkList) {
  console.error('FAIL: portfolio missing work-list', pf);
  process.exit(1);
}
if (!lug || lug.layout !== 'luggage' || !/bag-layers/.test(lug.app)) {
  console.error('FAIL: luggage layout missing bag-layers', lug?.layout);
  process.exit(1);
}
const bagCount = (lug.app.match(/<li key="/g) || []).length;
if (bagCount < 12) {
  console.error('FAIL: luggage needs 12 bags, got', bagCount);
  process.exit(1);
}

// Pairwise App similarity: shared non-brand skeleton should stay well under twin threshold.
function skeleton(src) {
  return src
    .replace(/WarpAtelier X|NorthCup Y|LensRoom Z/g, 'BRAND')
    .replace(/#[0-9a-fA-F]{3,8}/g, '#COLOR')
    .replace(/\s+/g, ' ')
    .trim();
}
const sk = apps.map((a) => skeleton(a.app));
for (let i = 0; i < sk.length; i++) {
  for (let j = i + 1; j < sk.length; j++) {
    if (sk[i] === sk[j]) {
      console.error('FAIL: identical skeletons', apps[i].brand, apps[j].brand);
      process.exit(1);
    }
    // crude overlap: longest shared substring check via length of common class markers
    const aMarks = (apps[i].app.match(/layout-\w+|className="[^"]+"/g) || []).join('|');
    const bMarks = (apps[j].app.match(/layout-\w+|className="[^"]+"/g) || []).join('|');
    if (aMarks === bMarks) {
      console.error('FAIL: same className fingerprint', apps[i].brand, apps[j].brand);
      process.exit(1);
    }
  }
}

console.log('smoke-invent-demo-unique: ok', [...layouts]);
