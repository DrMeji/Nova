/**
 * Acceptance smoke for storefront genre + repair-before-floor + rich commerce floor.
 * Run: npm run smoke:storefront
 */
import { inferBuildGenre, scoreStorefrontContract, briefLooksLikeStorefront } from '../src/lib/createLayoutContract.ts';
import { formatOriginalCraftRules, lintOriginalCreateQuality, inferCompositionFamily } from '../src/lib/createDesignSystem.ts';
import { buildStorefrontCommerceFloor } from '../src/lib/createStorefrontFloor.ts';
import {
  buildStorefrontPlan,
  repairStorefrontToContract,
  scoreStorefrontDesignQuality,
} from '../src/lib/createStorefrontRepair.ts';
import { buildBriefInteractiveFloor, briefLooksLikeCommerceStore, appHasCommerceCart, previewReadyForBrief, ensureViteReactProjectFiles } from '../src/lib/createBuildQuality.ts';

const brief = 'Build a professional liquor bottle shop where people can browse, see origin/age/notes, add quantities to cart, and purchase.';
const name = 'Nightport Spirits';
const palette = {
  bg: '#120c0a',
  panel: '#1c1410',
  text: '#f4ebe3',
  muted: '#a89888',
  accent: '#d4a574',
  glow: '#d4a57466',
  btnInk: '#1a100c',
  font: '"Fraunces", "Iowan Old Style", serif',
  line: '#3a2a22',
};

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(briefLooksLikeStorefront(brief, name), 'briefLooksLikeStorefront');
assert(briefLooksLikeCommerceStore(brief), 'briefLooksLikeCommerceStore');
assert(inferBuildGenre(brief, name).genre === 'storefront', 'inferBuildGenre → storefront');
assert(inferCompositionFamily(brief, name) === 'catalog-store', 'composition → catalog-store');

const plan = buildStorefrontPlan(brief, name);
assert(plan.requireProductsFile && plan.minProducts >= 8, 'storefront plan requires products.ts ≥8');
assert(plan.interactions.includes('qty-stepper'), 'plan includes qty-stepper');

const rules = formatOriginalCraftRules({ brief, productName: name, freshnessKey: 'smoke1' }).join('\n');
assert(/STOREFRONT CONTRACT/i.test(rules), 'craft rules include STOREFRONT CONTRACT');
assert(/REQUIRED @@@FILE[\s\S]*products\.ts/i.test(rules), 'craft rules REQUIRE products.ts');
assert(/structural plan/i.test(rules), 'craft rules include structural plan');

const floor = buildStorefrontCommerceFloor(name, brief, palette);
assert(Boolean(floor.files['src/data/products.ts']), 'floor emits src/data/products.ts');
assert(/Amber Reserve|North Rye|Casa Humo/i.test(floor.files['src/data/products.ts']), 'floor has rich liquor catalog');

const files = {
  'src/App.tsx': floor.app,
  'src/App.css': floor.css,
  ...floor.files,
};
const shop = scoreStorefrontContract(files, { brief });
assert(shop.ok, `scoreStorefrontContract ok (score=${shop.score}) reasons=${shop.reasons.join('; ')}`);
const design = scoreStorefrontDesignQuality(files);
assert(design.ok, `design quality ok (score=${design.score}) ${design.reasons.join('; ')}`);
assert(appHasCommerceCart(files), 'appHasCommerceCart');

// Partial craft: hero+nav+footer but no cart — repair must close contract without full floor wipe.
const partial = {
  'src/App.tsx': `import { useState } from 'react';
import './App.css';
export default function App() {
  return (
    <div className="site">
      <header><nav><a href="#top">${name}</a></nav></header>
      <section className="hero"><h1>${name}</h1><p>Browse bottles.</p></section>
      <section className="story"><h2>Our cellar</h2></section>
      <footer className="foot">© ${name}</footer>
    </div>
  );
}
`,
  'src/App.css': `.site{width:100%;min-height:100vh;background:#120c0a;color:#f4ebe3;font-family:Georgia,serif}
.hero{min-height:70vh;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#5a3a22,transparent 55%),#120c0a}
.foot{padding:2rem;text-align:center}
`,
};
const repaired = repairStorefrontToContract(partial, { productName: name, brief });
assert(repaired.changed, `repair changed: ${repaired.actions.join(',')}`);
assert(!repaired.needFloor, 'salvageable partial does not needFloor');
assert(repaired.contractOk, `repair closes contract: ${repaired.reasons.join('; ')}`);
assert(Boolean(repaired.files['src/data/products.ts']), 'repair emits products.ts');
assert(/NOVA_STOREFRONT_ISLAND|Add to cart/i.test(repaired.files['src/App.tsx'] || ''), 'repair injects commerce without full floor replace');
assert(!/Amber Reserve Bourbon[\s\S]*export default function App/i.test(repaired.files['src/App.tsx'] || ''), 'repair did not replace App with full floor source');

const viaBrief = buildBriefInteractiveFloor(name, brief);
assert(Boolean(viaBrief.files?.['src/data/products.ts']), 'buildBriefInteractiveFloor returns products.ts');

const wired = ensureViteReactProjectFiles(files, name).files;
const orig = lintOriginalCreateQuality(wired, { brief, productName: name });
assert(orig.ok || orig.reasons.every((r) => !/storefront/i.test(r)), `orig lint storefront-clean: ${orig.reasons.join('; ')}`);

const ready = previewReadyForBrief(wired, { productName: name, brief });
assert(ready.ok || ready.reasons.filter((r) => /storefront|cart|purchase|priced products/i.test(r)).length === 0,
  `Ready storefront gates: ${ready.ok ? 'ok' : ready.reasons.join('; ')}`);

// Non-liquor specialty retail still classifies storefront
const hwBrief = 'Build an online boutique hardware shop where people browse tools, filter by type, add quantities to cart, and purchase.';
assert(inferBuildGenre(hwBrief, 'Forge & Bit').genre === 'storefront', 'non-liquor shop → storefront');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nstorefront contract smoke passed');
