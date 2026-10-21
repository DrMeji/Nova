/**
 * Storefront compose-first ladder: catalog → cart → chrome → mark → hero.
 * Spine is the primary path — not invent-stall + hard-guarantee salvage.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-storefront-ladder.mjs
 */
import assert from 'node:assert/strict';
import {
  briefWantsStorefrontLadder,
  composeStorefrontSpine,
  gradeStorefrontQuality,
  runStorefrontCreateLadder,
  storefrontFlaskLogoSvg,
  storefrontHeroSvg,
} from '@/lib/createStorefrontLadder';
import { briefLooksLikeInsulatedBottleShop } from '@/lib/createStorefrontFloor';
import { appHasCommerceCart } from '@/lib/createBuildQuality';
import { brandLogoSvgFor } from '@/lib/brandAssets';
import { blankSolidColorFromAsk } from '@/lib/webProjectCanon';
import { looksLikeHardCreateGo, looksLikeImplementGo } from '@/lib/chatPlanMode';

const blank = {
  'src/App.jsx': `import './App.css'\nexport default function App() {\n  return <div className="app"><h1>Hello</h1></div>\n}\n`,
  'src/App.css': `.app { min-height: 100vh; background: #fff; }\n`,
  'src/index.css': `html, body, #root { margin: 0; min-height: 100%; }\n`,
  'index.html': `<!doctype html><html><body><div id="root"></div></body></html>\n`,
};

const bottleBrief = [
  'Create a new e-commerce website project called ValeBottle on disk now.',
  'Not a blank page — welcoming cream ivory storefront.',
  'Insulated water bottle brand (not liquor, not wine).',
  'Exactly 9 bottles with colors, sizes, and prices.',
  'Working add to cart, quantity, and purchase.',
  'About, Careers, Help, and a support email.',
].join(' ');

assert.equal(briefWantsStorefrontLadder(bottleBrief, 'ValeBottle'), true, 'wants storefront ladder');
assert.equal(briefLooksLikeInsulatedBottleShop('ValeBottle', bottleBrief), true, 'insulated bottle shop');
assert.equal(
  briefWantsStorefrontLadder('Build a gaming desk landing page with Shop the desk CTA.', 'RaidDesk'),
  false,
  'desk landing is not storefront ladder',
);

// Blank-solid must not wipe rich cream storefront asks.
assert.equal(blankSolidColorFromAsk(bottleBrief), null, 'no blank wipe on cream storefront');
assert.equal(
  blankSolidColorFromAsk('not a blank page — cream website with cart and 9 bottles'),
  null,
  'negation + cart escapes blank wipe',
);

// Hard-go: create on disk must leave planning.
assert.equal(looksLikeHardCreateGo(bottleBrief), true, 'hard create go');
assert.equal(looksLikeImplementGo(bottleBrief), true, 'implement go');

const logo = brandLogoSvgFor({
  productName: 'ValeBottle',
  brief: bottleBrief,
  css: 'background:#f7f3eb',
});
assert.ok(logo.length > 40, 'shop logo svg');
assert.ok(!/M9 18V5l12-2v13/i.test(logo), 'not music note');
assert.ok(!/M9\.937 15\.5/i.test(logo), 'not sparkles');
// Wine glass path used by lucide:wine — insulated must not use it.
assert.ok(!/M12 15a5 5 0 0 0 5-5c0-2/i.test(logo), 'not wine glass on insulated shop');

const flask = storefrontFlaskLogoSvg('#0f766e');
assert.ok(flask.includes('<svg'), 'flask svg');
assert.ok(storefrontHeroSvg('ValeBottle').includes('ValeBottle'), 'hero names brand');

const spine = composeStorefrontSpine('ValeBottle', bottleBrief, 'smoke1');
assert.ok(spine['src/data/products.ts'], 'products.ts');
assert.ok((spine['src/data/products.ts'].match(/"id"\s*:/g) || []).length >= 9, '9 SKUs');
assert.ok(appHasCommerceCart(spine), 'cart + purchase');
assert.ok(spine['public/logo.svg'], 'logo');
assert.ok(Object.keys(spine).some((p) => /public\/heroes\/.+\.svg$/i.test(p)), 'hero svg on disk');
assert.ok(/#f7f3eb/i.test(spine['src/App.css'] || ''), 'ivory canvas');

const graded = gradeStorefrontQuality(spine, bottleBrief, 'ValeBottle');
assert.equal(graded.okQuality, true, `Quality Accept: ${graded.reasons.join('; ')}`);
assert.equal(graded.label, 'Quality', 'Quality label');

const ladder = await runStorefrontCreateLadder({
  brief: bottleBrief,
  productName: 'ValeBottle',
  files: { ...blank },
  host: { pushStatus: () => {} },
  salt: 'smoke2',
});
assert.equal(ladder.ok, true, `ladder ok: ${ladder.reason || ''}`);
assert.ok(ladder.beatsDone.includes('catalog'), 'catalog beat');
assert.ok(ladder.beatsDone.includes('cart'), 'cart beat');
assert.ok(ladder.beatsDone.includes('mark'), 'mark beat');
assert.ok(ladder.beatsDone.includes('hero'), 'hero beat');
assert.equal(ladder.grade.okQuality, true, 'ladder Quality');

// Generic goods storefront still wants ladder.
const goodsBrief = 'Create an online store with cart, checkout, and a product catalog on disk.';
assert.equal(briefWantsStorefrontLadder(goodsBrief, 'GoodsCo'), true, 'generic commerce ladder');

console.log('smoke-storefront-ladder: ok');
