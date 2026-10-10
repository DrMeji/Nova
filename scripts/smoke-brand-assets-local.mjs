/**
 * Brand Assets: bundled Lucide first (offline), brief-derived logo family, no HTTP in this smoke.
 * Run: npm run smoke:brand-assets-local
 */
import assert from 'node:assert/strict';
import { hasLocalLucideIcon, localIconifySvg } from '../src/lib/localLucideIcons.ts';
import { planBrandAssets, materializeBrandAssets, logoIconifyFor } from '../src/lib/brandAssets.ts';

// Any network call in this smoke is a failure (disk-first contract).
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('network disabled in smoke');
};

assert.ok(hasLocalLucideIcon('search'));
assert.match(localIconifySvg('lucide:search', '#111') || '', /<svg[\s\S]*stroke="#111"[\s\S]*<\/svg>/);
assert.equal(localIconifySvg('simple-icons:apple'), null, 'non-lucide stays HTTP-only');

// Logo: family mark from the brief, not the generic sparkle.
const cases = [
  ['Brewline', 'Order espresso ahead for pickup at our coffee bar', 'lucide:coffee'],
  ['Saltmere Gin', 'Coastal gin brand with tasting notes · not coffee', 'lucide:wine'],
  ['Emberlot Roasters', 'Specialty coffee farm origin tasting notes', 'lucide:coffee'],
  ['Hearth', 'Doorbell and smart home security dashboard', 'lucide:shield-check'],
  ['Quiet Shelf', 'Borrow and lend books with friends', 'lucide:library'],
  ['Kiln', 'A calculator app', 'lucide:calculator'],
  // P0: "tasting notes" must NOT steal matcha/tea brands into notebook-pen.
  ['Verdigris Matcha Co.', 'Build a website for a small-batch matcha brand. Mountain origin, tin hero, tasting notes, Shop + Steep CTAs.', 'lucide:leaf'],
];
for (const [name, brief, want] of cases) {
  const logo = planBrandAssets(brief, name).slots.find((s) => s.role === 'logo');
  assert.equal(logo?.iconify, want, `${name} logo → ${want}, got ${logo?.iconify}`);
  assert.equal(logoIconifyFor(name, brief), want, `logoIconifyFor(${name}) → ${want}`);
}
{
  const logo = planBrandAssets('Something abstract', 'Zzz').slots.find((s) => s.role === 'logo');
  assert.equal(logo?.iconify, 'lucide:sparkles', 'sparkles only as last resort');
}

// Every lucide id the planner can emit must be bundled.
const briefs = [
  'Add professional icons: menu, search, profile, settings, bell, heart, cart, home, mail, calendar',
  'restaurant security camera air purifier shop with icons',
  'borrow books library with icons',
];
for (const b of briefs) {
  for (const s of planBrandAssets(b, 'Test').slots) {
    if (s.role === 'hero' || !s.iconify || !s.iconify.startsWith('lucide:')) continue;
    assert.ok(localIconifySvg(s.iconify), `missing local icon for ${s.iconify}`);
  }
}

// Materialize with no Electron bridge: icons/logo land from the local map without fetch.
{
  const plan = planBrandAssets('Add professional icons: menu, search, profile. Keep cream.', 'Shelf');
  plan.slots = plan.slots.filter((s) => s.role !== 'hero');
  const out = await materializeBrandAssets({
    diskRoot: 'C:\\tmp\\nova-smoke',
    files: { 'src/App.css': '.app{background:#fef3c7}', 'src/App.jsx': 'export default function App(){return <div className="app"/>}' },
    plan,
    brief: 'Add professional icons: menu, search, profile. Keep cream.',
    projectName: 'Shelf',
  });
  assert.ok(out.files['public/icons/menu.svg']?.includes('<svg'), 'menu.svg from local map');
  assert.ok(out.files['public/icons/menu.svg'].includes('#1a1a1a'), 'ink tint on light canvas');
  assert.ok(out.saved.includes('public/icons/search.svg'));
  assert.match(out.note, /bundled Lucide/);
}

assert.equal(fetchCalls, 0, 'no network calls');
console.log('ok brand-assets-local');
