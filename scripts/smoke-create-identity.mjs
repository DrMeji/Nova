/**
 * Smoke: CreateIdentity bakery ≠ Veopx ≠ discord; ensureStylesLinked; hero queries differ.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createIdentityFromBrief,
  ensureStylesLinked,
  stylesAreLinked,
  polishPromptLinesFromIdentity,
  identityCreateMisses,
} from '../src/lib/createIdentity.ts';
import { pickMarketingPalette, buildMarketingCompanionCss } from '../src/lib/createBuildQuality.ts';

const bakery = createIdentityFromBrief('Ovenfold', 'warm cream bakery croissant sourdough pastry shop');
assert.equal(bakery.category, 'bakery');
assert.equal(bakery.mood, 'light-warm');
assert.equal(bakery.layout, 'warm-shop');
assert.match(bakery.palette.bg, /^#f3efe6$/i);
assert.ok(bakery.heroQueries.some((h) => /bakery|croissant|sourdough|pastry/i.test(h.q)));
assert.ok(!bakery.heroQueries.some((h) => /premium product photography editorial unique/i.test(h.q)));
assert.ok(bakery.forbidden.hex.includes('#0c0a09'));
assert.ok(bakery.forbidden.hex.includes('#3dff9a'));

// "Premium" tightens craft — must NOT switch bakery to Veopx editorial-dark.
const premiumBakery = createIdentityFromBrief('Ovenfold', 'premium bakery cream pastry shop');
assert.equal(premiumBakery.category, 'bakery');
assert.equal(premiumBakery.mood, 'light-warm');
assert.match(premiumBakery.palette.bg, /^#f3efe6$/i);

const vaguePremium = createIdentityFromBrief('NovaSite', 'premium website product marketing landing');
assert.notEqual(vaguePremium.layout, 'editorial-dark');
assert.notEqual(vaguePremium.category, 'lighting');

const veopx = createIdentityFromBrief('Veopx', 'quiet luxury sculptural lamp Light distilled soft mint orbs');
assert.equal(veopx.category, 'lighting');
assert.equal(veopx.mood, 'dark-editorial');
assert.equal(veopx.layout, 'editorial-dark');
assert.ok(/07090d|0c0a09|#07/i.test(veopx.palette.bg) || veopx.palette.bg === '#07090d');

const discord = createIdentityFromBrief('NovaCord', 'Discord-like chat app with servers channels and chat pane');
assert.equal(discord.category, 'chat');
assert.equal(discord.layout, 'chat-shell');

const bakeryQs = bakery.heroQueries.map((h) => h.q).join('|');
const veopxQs = veopx.heroQueries.map((h) => h.q).join('|');
assert.notEqual(bakeryQs, veopxQs);
assert.ok(!/#?heroes\/hero\.jpg/.test(bakery.heroHref));
assert.match(bakery.heroHref, /\/heroes\/ovenfold-hero\.jpg/i);

const bakeryPrompt = polishPromptLinesFromIdentity(bakery, 'src/App.jsx', 'warm bakery').join('\n');
assert.ok(!/Discover top-right|soft mint pill|01 \/ 02 \/ 03/i.test(bakeryPrompt));
assert.ok(/cream|warm-shop|App\.css/i.test(bakeryPrompt));
assert.ok(!/\/heroes\/hero\.jpg/i.test(bakeryPrompt));

const veopxPrompt = polishPromptLinesFromIdentity(veopx, 'src/App.jsx', 'quiet luxury lamp').join('\n');
assert.ok(/editorial-dark|Discover|mint/i.test(veopxPrompt));

const p = pickMarketingPalette('Ovenfold', 'warm cream bakery');
assert.match(p.bg, /^#f3efe6$/i);

const css = buildMarketingCompanionCss('Ovenfold', 'warm cream bakery', bakery);
assert.ok(css.includes('#f3efe6'));
assert.ok(!/#0c0a09/.test(css));
assert.ok(!/#3dff9a/i.test(css));

const files = {
  'src/App.css': css,
  'src/App.jsx': 'export default function App(){return <div className="app"/>}\n',
  'src/main.jsx': "import App from './App'\n",
};
assert.equal(stylesAreLinked(files), false);
const linked = ensureStylesLinked(files);
assert.ok(linked.changed.includes('src/App.jsx') || linked.changed.includes('src/main.jsx'));
assert.equal(stylesAreLinked(linked.files), true);

const misses = identityCreateMisses(bakery, {
  'src/App.css': ':root { --bg: #0c0a09; --accent: #3dff9a; }',
  'src/App.jsx': "import './App.css';\nexport default function App(){return <div/>}\n",
});
assert.ok(misses.some((m) => /forbids/i.test(m)));

// Legacy hero.jpg writers must not remain in identity-owned modules (except create rewrite).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const rel of [
  'src/lib/siteHeroImages.ts',
  'src/lib/brandAssets.ts',
  'src/lib/createBuildQuality.ts',
]) {
  const body = fs.readFileSync(path.join(root, rel), 'utf8');
  const hits = [...body.matchAll(/\/heroes\/hero\.jpg/g)];
  assert.equal(hits.length, 0, `${rel} still writes /heroes/hero.jpg (${hits.length})`);
}

console.log('smoke-create-identity OK', {
  bakery: bakery.mood,
  premiumBakery: premiumBakery.category,
  vaguePremium: vaguePremium.layout,
  veopx: veopx.mood,
  discord: discord.layout,
  linked: linked.changed,
});
