/**
 * Smoke: brief-only CreateBriefSpec — no bakery/Discord/Veopx lookbook categories.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBriefSpecFromAsk,
  createIdentityFromBrief,
  ensureStylesLinked,
  stylesAreLinked,
  polishPromptLinesFromBrief,
  briefCreateMisses,
  detectHeroProductKind,
} from '../src/lib/createIdentity.ts';
import { logoIconifyFor } from '../src/lib/brandAssets.ts';

const bakeryBrief = 'warm cream bakery croissant sourdough pastry shop with online ordering';
const bakery = createBriefSpecFromAsk('Ovenfold', bakeryBrief);
assert.equal(bakery.name, 'Ovenfold');
assert.match(bakery.heroHref, /\/heroes\/ovenfold-hero\.jpg/i);
assert.ok(bakery.mustHave.length >= 0);
assert.equal(bakery.referenceMode, 'none');

// Transitional CreateIdentity wrapper must not invent lookbook categories.
const bakeryId = createIdentityFromBrief('Ovenfold', bakeryBrief);
assert.equal(bakeryId.category, 'brief');
assert.equal(bakeryId.mood, 'brief');
assert.equal(bakeryId.layout, 'brief');
assert.ok(bakeryId.heroQueries.some((h) => /Ovenfold|bakery|croissant|pastry|sourdough/i.test(h.q)));
assert.ok(!bakeryId.heroQueries.some((h) => /premium product photography editorial unique$/i.test(h.q)));

const ceramicBrief = 'Lumenforge Studio ceramics in cream glaze and charcoal stoneware; brand mark inspired by Apple, not skincare.';
assert.equal(detectHeroProductKind('Lumenforge Studio', ceramicBrief), 'ceramic');
const ceramicIdentity = createIdentityFromBrief('Lumenforge Studio', ceramicBrief);
assert.notEqual(ceramicIdentity.palette.bg, '#f3eee4', 'ceramics should not take the skincare/bakery cream fallback');
assert.equal(
  logoIconifyFor('Lumenforge Studio', ceramicBrief),
  'lucide:utensils',
  'ceramics must use utensils/tableware mark, never sparkles/lotion',
);
const noAppleCopyBrief = 'handmade ceramic dinnerware, cream-and-charcoal, do not copy any Apple design language';
assert.equal(logoIconifyFor('Kiln & Clay', noAppleCopyBrief), 'lucide:utensils');
assert.equal(
  detectHeroProductKind('Kiln & Clay', noAppleCopyBrief),
  'ceramic',
  'Apple negation must not force phone/device hero on ceramic briefs',
);
assert.notEqual(
  detectHeroProductKind('Studio', 'do not copy Apple; build a pottery kiln brand site'),
  'phone',
  'scrubbed Apple must not pick phone silhouette',
);

const veopx = createBriefSpecFromAsk('Veopx', 'quiet luxury sculptural lamp Light distilled soft mint orbs');
assert.equal(veopx.name, 'Veopx');
assert.match(veopx.heroHref, /\/heroes\/veopx-hero\.jpg/i);

const discord = createBriefSpecFromAsk('NovaCord', 'Discord-like chat app with servers channels and chat pane');
assert.equal(discord.name, 'NovaCord');
assert.ok(discord.mustHave.some((m) => /messag/i.test(m)) || /chat|messag/i.test(discord.brief));

const bakeryPrompt = polishPromptLinesFromBrief(bakery, 'src/App.jsx', bakeryBrief).join('\n');
assert.ok(!/Discover top-right|soft mint pill|01 \/ 02 \/ 03|Discord-like|warm-shop|editorial-dark/i.test(bakeryPrompt));
assert.ok(/Ovenfold|bakery|App\.css|THIS brief|unique visual language/i.test(bakeryPrompt));
assert.ok(bakeryPrompt.includes(bakeryBrief.slice(0, 40)));
assert.ok(!/\/heroes\/hero\.jpg/i.test(bakeryPrompt));

const veopxPrompt = polishPromptLinesFromBrief(veopx, 'src/App.jsx', 'quiet luxury lamp').join('\n');
assert.ok(!/Discover top-right|soft mint pill|01 \/ 02 \/ 03/i.test(veopxPrompt));
assert.ok(/Veopx|unique|THIS brief|App\.css/i.test(veopxPrompt));

const files = {
  'src/App.css': '.app{min-height:100vh}\n',
  'src/App.jsx': 'export default function App(){return <div className="app"/>}\n',
  'src/main.jsx': "import App from './App'\n",
};
assert.equal(stylesAreLinked(files), false);
const linked = ensureStylesLinked(files);
assert.ok(linked.changed.includes('src/App.jsx') || linked.changed.includes('src/main.jsx'));
assert.equal(stylesAreLinked(linked.files), true);

const thinMisses = briefCreateMisses(bakery, {
  'src/App.css': '.app{}\n',
  'src/App.jsx': "import './App.css';\nexport default function App(){return <div/>}\n",
});
assert.ok(thinMisses.some((m) => /thin|empty/i.test(m)));

// Multi-restaurant brief should miss when App has no search.
const restSpec = createBriefSpecFromAsk('AnyTable', 'search any restaurant and book a table');
const restMisses = briefCreateMisses(restSpec, {
  'src/App.css': '.app{padding:1rem}\n',
  'src/App.jsx': "import './App.css';\nexport default function App(){return <main><h1>AnyTable</h1><p>Book our kitchen</p></main>}\n",
});
assert.ok(restMisses.some((m) => /search/i.test(m)));

// Legacy hero.jpg writers must not remain in identity-owned modules.
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
  bakery: bakery.slug,
  veopx: veopx.slug,
  discord: discord.slug,
  linked: linked.changed,
  promptHasBrief: bakeryPrompt.includes('croissant'),
});
